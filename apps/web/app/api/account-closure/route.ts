import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import User from "@/models/User";
import {
    apiResponse,
    requestContext,
    requireSameOrigin,
    readBoundedJson,
    limitRequest,
} from "@/services/content-changes/http";
import { requireCondition } from "@/services/content-changes/errors";
import { assertNoMemberMimicMutation } from "@/services/member-mimic/context";
import { accountClosureReview } from "@/services/account-closure/review";
import { eraseAccount } from "@/services/account-closure/erase";
import { reopenAccountBeforeErasure } from "../../../../../packages/common-logic/src/account-lifecycle/gate";

export const dynamic = "force-dynamic";
const confirmation = z
    .object({
        reviewHash: z.string().regex(/^[a-f0-9]{64}$/),
        confirmation: z.literal("CLOSE"),
    })
    .strict();
async function identity(req: NextRequest) {
    assertNoMemberMimicMutation(req.headers);
    const ctx = await requestContext(req);
    requireCondition(
        ctx.user,
        "unauthorized",
        "Sign in to review account closure.",
        401,
    );
    // Ask Better Auth for its persisted session, bypassing the signed cookie cache.
    const session = await auth.api.getSession({
        headers: req.headers,
        query: { disableCookieCache: true },
    });
    requireCondition(
        session &&
            session.user.id === String(ctx.user._id) &&
            session.session.userId === String(ctx.user._id),
        "unauthorized",
        "Sign in again to confirm your identity.",
        401,
    );
    const createdAt = new Date(session.session.createdAt).getTime();
    const recentIdentity =
        Number.isFinite(createdAt) &&
        createdAt <= Date.now() &&
        Date.now() - createdAt < 10 * 60_000;
    return { ctx, recentIdentity };
}
export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        const { ctx, recentIdentity } = await identity(req);
        await limitRequest(req, ctx, "account-closure-review", 30);
        return {
            ...(await accountClosureReview(ctx.user, ctx)),
            recentIdentity,
        };
    });
}
export async function DELETE(req: NextRequest) {
    return apiResponse(async () => {
        requireSameOrigin(req);
        const { ctx, recentIdentity } = await identity(req);
        requireCondition(
            recentIdentity,
            "identity_required",
            "Sign in again before closing your account.",
            403,
        );
        await limitRequest(req, ctx, "account-closure-confirm", 6);
        const input = confirmation.parse(await readBoundedJson(req, 1024));
        const successor = await User.findOne({
            domain: ctx.subdomain._id,
            email: ctx.subdomain.email,
            active: true,
        });
        requireCondition(
            successor && successor.userId !== ctx.user.userId,
            "needs_review",
            "Contact support to arrange account closure.",
            409,
        );
        return eraseAccount(ctx.user, successor, ctx, input.reviewHash);
    });
}
export async function PATCH(req: NextRequest) {
    return apiResponse(async () => {
        requireSameOrigin(req);
        const { ctx } = await identity(req);
        z.object({ action: z.literal("keep") })
            .strict()
            .parse(await readBoundedJson(req, 256));
        await reopenAccountBeforeErasure({
            domainId: String(ctx.subdomain._id),
            userId: ctx.user.userId,
        });
        const review = await accountClosureReview(ctx.user, ctx);
        requireCondition(
            review.state === "active",
            "conflict",
            "Erasure has started. Contact support to check its result.",
            409,
        );
        return { kind: "kept" };
    });
}
