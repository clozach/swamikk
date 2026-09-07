import type { NextRequest } from "next/server";
import { z } from "zod";
import {
    apiResponse,
    limitRequest,
    readBoundedJson,
    requestContext,
    requireSameOrigin,
} from "@/services/content-changes/http";
import { requireCondition } from "@/services/content-changes/errors";
import {
    assertNoMemberMimicMutation,
    resolveMemberReadContext,
} from "@/services/member-mimic/context";
import { readMemberBilling } from "@/services/member-billing/read";
import { prepareMemberCancellation } from "@/services/member-billing/prepare";
import { advanceMemberCancellation } from "@/services/member-billing/advance";
import { withAccountWrite } from "../../../../../packages/common-logic/src/account-lifecycle/gate";
import { requireBillingMember } from "@/services/member-billing/memberships";

export const dynamic = "force-dynamic";
const id = z.string().min(1).max(128);
const command = z.discriminatedUnion("action", [
    z.object({ action: z.literal("prepare"), membershipId: id }).strict(),
    z
        .object({
            action: z.literal("confirm"),
            operationId: id,
            quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    z
        .object({
            action: z.literal("reconcile"),
            operationId: id,
            quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
]);
export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        const actor = await requestContext(req);
        const resolution = await resolveMemberReadContext(req.headers, actor);
        requireCondition(
            resolution.kind !== "expired",
            "mimic_expired",
            "Member Mimic has ended. Return to administration.",
            403,
        );
        await limitRequest(req, resolution.context, "member-billing-read", 60);
        return readMemberBilling(resolution.context);
    });
}
export async function POST(req: NextRequest) {
    return apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "member-billing-write", 20);
        const input = command.parse(await readBoundedJson(req, 2048));
        requireBillingMember(ctx, true);
        return withAccountWrite(
            {
                domainId: String(ctx.subdomain._id),
                userId: ctx.user.userId,
                purpose: "member-billing",
            },
            () =>
                input.action === "prepare"
                    ? prepareMemberCancellation(ctx, input.membershipId)
                    : advanceMemberCancellation(ctx, input),
        );
    });
}
