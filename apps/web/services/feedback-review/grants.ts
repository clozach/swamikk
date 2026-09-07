import { createHash, randomBytes, randomUUID } from "crypto";
import type GQLContext from "@/models/GQLContext";
import UserModel from "@/models/User";
import { checkPermission } from "@courselit/utils";
import type { FeedbackReviewScope } from "@courselit/common-models";
import type { InternalFeedbackReviewGrant } from "@courselit/orm-models";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import { requireCondition } from "../content-changes/errors";
import { ReviewGrantModel } from "./models";
import { grantInput, safeJson } from "./validation";
export const hashToken = (token: string) =>
    createHash("sha256").update(token).digest("hex");
export const grantView = (grant: InternalFeedbackReviewGrant) => ({
    id: grant.id,
    name: grant.name,
    scopes: grant.scopes,
    issuerUserId: grant.issuerUserId,
    state: grant.state,
    expiresAt: grant.expiresAt.toISOString(),
    activeOperations: grant.operations.length,
    createdAt: grant.createdAt.toISOString(),
});
export function requireSettingsAdmin(ctx: GQLContext) {
    requireCondition(
        ctx.user?.active &&
            !ctx.memberMimic &&
            String(ctx.user.domain) === String(ctx.subdomain._id) &&
            checkPermission(ctx.user.permissions, ["setting:manage"]),
        "forbidden",
        "An active settings administrator is required.",
        403,
    );
}
export async function requireIssuer(
    domainId: string,
    userId: string,
    scopes: FeedbackReviewScope[],
) {
    const user = await UserModel.findOne({
        domain: domainId,
        userId,
        active: true,
    });
    const permissions = [
        "setting:manage",
        ...scopes.map((scope) =>
            scope === "public-page-text" ? "site:manage" : "course:manage_any",
        ),
    ];
    requireCondition(
        user &&
            permissions.every((permission) =>
                checkPermission(user.permissions, [permission]),
            ),
        "grant_unavailable",
        "This review grant is unavailable.",
        401,
    );
    return user;
}
export async function issueGrant(raw: unknown, ctx: GQLContext) {
    requireSettingsAdmin(ctx);
    safeJson(raw);
    const input = grantInput.parse(raw);
    return withAccountWrite(
        {
            domainId: String(ctx.subdomain._id),
            userId: ctx.user.userId,
            purpose: "feedback-review-grant",
        },
        async () => {
            await requireIssuer(
                String(ctx.subdomain._id),
                ctx.user.userId,
                input.scopes,
            );
            const id = randomUUID(),
                token = `fbr_${id}.${randomBytes(32).toString("base64url")}`;
            const grant = await ReviewGrantModel.create({
                domain: ctx.subdomain._id,
                id,
                name: input.name,
                issuerUserId: ctx.user.userId,
                tokenHash: hashToken(token),
                scopes: input.scopes,
                expiresAt: new Date(
                    Date.now() + input.expiresInDays * 86400_000,
                ),
                state: { kind: "active" },
                operations: [],
            });
            return { grant: grantView(grant), token };
        },
    );
}
export async function listGrants(ctx: GQLContext) {
    requireSettingsAdmin(ctx);
    const grants = await ReviewGrantModel.find({ domain: ctx.subdomain._id })
        .sort({ createdAt: -1 })
        .limit(100);
    return { grants: grants.map(grantView) };
}
export async function settleRevocation(domainId: string, id: string) {
    await ReviewGrantModel.updateOne(
        {
            domain: domainId,
            id,
            "state.kind": "revoking",
            operations: { $size: 0 },
        },
        { $set: { "state.kind": "revoked" } },
    );
}
export async function revokeGrant(id: string, ctx: GQLContext) {
    requireSettingsAdmin(ctx);
    return withAccountWrite(
        {
            domainId: String(ctx.subdomain._id),
            userId: ctx.user.userId,
            purpose: "feedback-review-revoke",
        },
        async () => {
            const operator = await UserModel.findOne({
                domain: ctx.subdomain._id,
                userId: ctx.user.userId,
                active: true,
            });
            requireCondition(
                operator &&
                    checkPermission(operator.permissions, ["setting:manage"]),
                "forbidden",
                "An active settings administrator is required.",
                403,
            );
            await ReviewGrantModel.updateOne(
                { domain: ctx.subdomain._id, id, "state.kind": "active" },
                {
                    $set: {
                        state: {
                            kind: "revoking",
                            at: new Date().toISOString(),
                            by: ctx.user.userId,
                        },
                    },
                },
            );
            await settleRevocation(String(ctx.subdomain._id), id);
            const grant = await ReviewGrantModel.findOne({
                domain: ctx.subdomain._id,
                id,
            });
            requireCondition(
                grant,
                "not_found",
                "Review grant not found.",
                404,
            );
            return { grant: grantView(grant) };
        },
    );
}
