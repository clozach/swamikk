import { NextRequest } from "next/server";
import schema from "@/graphql";
import { graphql } from "graphql";
import { getAddress } from "@/lib/utils";
import User from "@models/User";
import { auth } from "@/auth";
import { als } from "@/async-local-storage";
import { getCachedDomain } from "@/lib/domain-cache";
import { hasMemberMimicCookie } from "@/services/member-mimic/constants";
import { resolveMemberReadContext } from "@/services/member-mimic/context";
import { prepareMimicQuery } from "@/services/member-mimic/graphql";
import { readBoundedJson } from "@/services/content-changes/http";
import { withGraphqlAccountWrites } from "@/services/account-closure/graphql-write";
import { AccountLifecycleError } from "../../../../../packages/common-logic/src/account-lifecycle/gate";

async function updateLastActive(user: any) {
    const dateNow = new Date();
    dateNow.setUTCHours(0, 0, 0, 0);
    const userLastActiveDate = new Date(user.updatedAt);
    userLastActiveDate.setUTCHours(0, 0, 0, 0);

    if (dateNow.getTime() > userLastActiveDate.getTime()) {
        user.updatedAt = new Date();
        await user.save();
    }
}

export async function POST(req: NextRequest) {
    const domainName = req.headers.get("domain");
    if (!domainName) {
        return Response.json(
            { errors: [{ message: "Domain header is missing" }] },
            { status: 400 },
        );
    }

    let body: unknown;
    try {
        body = hasMemberMimicCookie(req.headers)
            ? await readBoundedJson(req, 64_000)
            : await req.json();
    } catch {
        return Response.json(
            { errors: [{ message: "A bounded JSON query is required." }] },
            { status: 400, headers: { "Cache-Control": "no-store" } },
        );
    }
    const [domain, session] = await Promise.all([
        getCachedDomain(domainName),
        auth.api.getSession({ headers: req.headers }),
    ]);

    if (!domain) {
        return Response.json(
            { errors: [{ message: "Domain not found" }] },
            { status: 404 },
        );
    }

    if (
        !body ||
        typeof body !== "object" ||
        !Object.prototype.hasOwnProperty.call(body, "query")
    ) {
        return Response.json({ error: "Query is missing" }, { status: 400 });
    }

    const map = new Map();
    map.set("domain", domainName);
    map.set("domainId", req.headers.get("domainId") || domain._id.toString());
    als.enterWith(map);

    let user;
    if (session) {
        user = await User.findOne({
            email: session.user!.email,
            domain: domain._id,
            active: true,
        });

        if (!user)
            return Response.json(
                {
                    errors: [
                        {
                            message:
                                "This signed-in account is unavailable. Sign out before continuing.",
                        },
                    ],
                },
                { status: 401, headers: { "Cache-Control": "no-store" } },
            );
    }

    let query, variables;
    const input = body as any;
    if (typeof input.query === "string") {
        query = input.query;
        variables = input.variables;
    } else if (input.query && typeof input.query === "object") {
        query = input.query.query;
        variables = input.query.variables;
    } else {
        return Response.json(
            { errors: [{ message: "Query is missing." }] },
            { status: 400 },
        );
    }
    const hostname = req.headers.get("host") || "";
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    let contextValue = {
        user,
        subdomain: domain,
        address: getAddress(hostname, protocol),
    };
    if (hasMemberMimicCookie(req.headers)) {
        try {
            const resolved = await resolveMemberReadContext(
                req.headers,
                contextValue,
            );
            if (resolved.kind === "expired")
                return Response.json(
                    {
                        errors: [
                            {
                                message:
                                    "This member view has ended. Exit Mimic to continue.",
                            },
                        ],
                    },
                    { status: 403, headers: { "Cache-Control": "no-store" } },
                );
            contextValue = resolved.context;
            query = prepareMimicQuery(query);
        } catch {
            return Response.json(
                {
                    errors: [
                        {
                            message:
                                "This action or information is unavailable in read-only Member Mimic. Exit Mimic to continue.",
                        },
                    ],
                },
                { status: 403, headers: { "Cache-Control": "no-store" } },
            );
        }
    }
    try {
        const response = await withGraphqlAccountWrites(
            {
                source: query,
                variables,
                operationName: input.operationName,
                ctx: contextValue as any,
            },
            async () => {
                if (user && !hasMemberMimicCookie(req.headers))
                    await updateLastActive(user);
                return graphql({
                    schema,
                    source: query,
                    rootValue: null,
                    contextValue,
                    variableValues: variables,
                    operationName: input.operationName,
                });
            },
        );
        return Response.json(response, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) {
        if (!(error instanceof AccountLifecycleError)) throw error;
        return Response.json(
            { errors: [{ message: error.message }] },
            { status: error.status, headers: { "Cache-Control": "no-store" } },
        );
    }
}
