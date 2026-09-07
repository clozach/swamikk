import { parse, getOperationAST, visit, valueFromASTUntyped } from "graphql";
import type GQLContext from "@/models/GQLContext";
import User from "@/models/User";
import Membership from "@/models/Membership";
import {
    AccountLifecycleError,
    withAccountWrite,
} from "../../../../packages/common-logic/src/account-lifecycle/gate";

/** Native queries can record activity too, so authenticated executions share the fence. */
export async function withGraphqlAccountWrites<T>(
    input: {
        source: string;
        variables?: Record<string, unknown>;
        operationName?: string;
        ctx: GQLContext;
    },
    execute: () => Promise<T>,
): Promise<T> {
    if (!input.ctx.user || input.ctx.memberMimic) return execute();
    let document;
    try {
        document = parse(input.source);
    } catch {
        return execute();
    }
    const operation = getOperationAST(document, input.operationName);
    if (!operation) return execute();
    const variables = { ...input.variables };
    operation.variableDefinitions?.forEach((definition) => {
        const name = definition.variable.name.value;
        if (variables[name] === undefined && definition.defaultValue)
            variables[name] = valueFromASTUntyped(definition.defaultValue);
    });
    const fields: string[] = [],
        ids = new Set<string>([input.ctx.user.userId]),
        emails = new Set<string>(),
        memberships = new Set<string>();
    const collect = (value: unknown, name = "") => {
        if (typeof value === "string") {
            if (name === "userId" || name === "userIds") ids.add(value);
            if (name === "email") emails.add(value);
            if (name === "membershipId") memberships.add(value);
        } else if (Array.isArray(value))
            value.forEach((item) => collect(item, name));
        else if (value && typeof value === "object")
            Object.entries(value).forEach(([key, item]) =>
                collect(
                    item,
                    name === "userData" && key === "id" ? "userId" : key,
                ),
            );
    };
    // Include fragments in the selected document: over-reservation is safe; hidden deletion is not.
    visit(document, {
        Field(node) {
            fields.push(node.name.value);
            node.arguments?.forEach((arg) =>
                collect(
                    valueFromASTUntyped(arg.value, variables),
                    arg.name.value,
                ),
            );
        },
    });
    if (fields.includes("deleteUser")) {
        if (operation.operation !== "mutation" || fields.length !== 1)
            throw new AccountLifecycleError(
                "account_unavailable",
                "Account deletion must be submitted on its own.",
            );
        return execute();
    }
    const domain = input.ctx.subdomain._id;
    if (operation.operation === "mutation") {
        if (emails.size)
            (
                await User.find({ domain, email: { $in: Array.from(emails) } })
                    .select("userId")
                    .lean()
            ).forEach((user) => ids.add(user.userId));
        if (memberships.size)
            (
                await Membership.find({
                    domain,
                    membershipId: { $in: Array.from(memberships) },
                })
                    .select("userId")
                    .lean()
            ).forEach((member) => ids.add(member.userId));
    }
    if (ids.size > 100)
        throw new AccountLifecycleError(
            "account_busy",
            "Split this account change into smaller requests.",
        );
    const ordered = Array.from(ids).sort();
    const run = (index: number): Promise<T> =>
        index === ordered.length
            ? execute()
            : withAccountWrite(
                  {
                      domainId: String(domain),
                      userId: ordered[index],
                      purpose: "graphql",
                      ...(ordered[index] === input.ctx.user.userId
                          ? {}
                          : { allowInactive: true as const }),
                  },
                  () => run(index + 1),
              );
    return run(0);
}
