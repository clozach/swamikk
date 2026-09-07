import { randomUUID } from "crypto";
import type GQLContext from "@/models/GQLContext";
import RefundRequest from "@/models/RefundRequest";
import { requireCondition } from "@/services/content-changes/errors";
import { requireRefundMember, requireRefundOperator } from "./receipts";
import { validateFirstRefundAttempt } from "./preflight";
import { refundRequestView } from "./projection";
import {
    refundRequestDependencies,
    type RefundRequestDependencies,
} from "./provider";
import { reconcilePurchaseRefund } from "./provider-refund";
import { requireApprovedRefundAccess, applyRefundAccess } from "./access";

export async function applyRefundRequest(
    ctx: GQLContext,
    requestId: string,
    operator: boolean,
    deps: RefundRequestDependencies = refundRequestDependencies,
    expectedReviewHash?: string,
) {
    if (operator) requireRefundOperator(ctx);
    else requireRefundMember(ctx);
    requireCondition(
        !ctx.memberMimic,
        "mimic_read_only",
        "Exit Member Mimic before making changes.",
        403,
    );
    const scope = {
        domain: ctx.subdomain._id,
        requestId,
        ...(operator ? {} : { userId: ctx.user.userId }),
    };
    let record = await RefundRequest.findOne(scope).lean();
    requireCondition(record, "not_found", "Refund request not found.", 404);
    requireCondition(
        !expectedReviewHash || record.reviewHash === expectedReviewHash,
        "conflict",
        "The refund review changed. Refresh its status.",
        409,
    );
    if (record.state === "complete")
        return refundRequestView(record, { operator });
    requireCondition(
        record.state === "approved" && record.quote,
        "conflict",
        "This request needs approval before a refund can be applied.",
        409,
    );
    requireApprovedRefundAccess(record);
    const now = deps.now(),
        claimId = randomUUID();
    if (record.claim && new Date(record.claim.expiresAt) > now)
        return refundRequestView(record, { operator, now });
    const claim = await RefundRequest.findOneAndUpdate(
        {
            ...scope,
            revision: record.revision,
            $or: [
                { claim: { $exists: false } },
                { "claim.expiresAt": { $lte: now } },
            ],
        },
        {
            $set: {
                claim: {
                    id: claimId,
                    expiresAt: new Date(now.getTime() + 5 * 60000),
                },
            },
            $inc: { revision: 1 },
        },
        { new: true },
    ).lean();
    if (!claim) {
        const current = await RefundRequest.findOne(scope).lean();
        requireCondition(
            current,
            "not_found",
            "Refund request not found.",
            404,
        );
        return refundRequestView(current, { operator, now });
    }
    record = claim;
    const ownedClaim = { ...scope, "claim.id": claimId };
    try {
        if (record.refund.kind === "not-started")
            await validateFirstRefundAttempt(ctx, record, operator, deps);
        let result =
            record.refund.kind === "result" ? record.refund.result : undefined;
        if (
            !result ||
            result.kind === "uncertain" ||
            (result.kind === "refund" &&
                ["pending", "requires_action"].includes(result.status))
        ) {
            const quote = record.quote!;
            const client = await deps.client(ctx, quote.mode);
            let allowCreate = false;
            if (record.refund.kind === "not-started") {
                const firstAttemptAt = deps.now();
                const first = await RefundRequest.findOneAndUpdate(
                    {
                        ...ownedClaim,
                        "claim.expiresAt": { $gt: firstAttemptAt },
                        "refund.kind": "not-started",
                    },
                    {
                        $set: { refund: { kind: "claimed", firstAttemptAt } },
                        $inc: { revision: 1 },
                    },
                    { new: true },
                ).lean();
                requireCondition(
                    first,
                    "conflict",
                    "The refund is being reconciled. Refresh it.",
                    409,
                );
                record = first;
                allowCreate = true;
            }
            const firstAttemptAt =
                record.refund.kind === "not-started"
                    ? undefined
                    : record.refund.firstAttemptAt;
            result = await reconcilePurchaseRefund(client, {
                quote,
                operationId: record.requestId,
                firstAttemptAt: firstAttemptAt
                    ? new Date(firstAttemptAt).toISOString()
                    : deps.now().toISOString(),
                allowCreate,
                now: deps.now(),
            });
            const saved = await RefundRequest.findOneAndUpdate(
                { ...ownedClaim, "claim.expiresAt": { $gt: deps.now() } },
                {
                    $set: {
                        refund: {
                            kind: "result",
                            firstAttemptAt,
                            result,
                            observationId: randomUUID(),
                            observedAt: deps.now(),
                        },
                    },
                    $inc: { revision: 1 },
                },
                { new: true },
            ).lean();
            requireCondition(
                saved,
                "conflict",
                "The refund result needs reconciliation. Refresh it.",
                409,
            );
            record = saved;
        }
        if (
            result.kind === "not-required" ||
            (result.kind === "refund" && result.status === "succeeded")
        ) {
            await applyRefundAccess(record);
            const completed = await RefundRequest.findOneAndUpdate(
                ownedClaim,
                {
                    $set: { state: "complete", access: "resolved" },
                    $inc: { revision: 1 },
                },
                { new: true },
            ).lean();
            requireCondition(
                completed,
                "conflict",
                "The access result needs reconciliation.",
                409,
            );
            record = completed;
        }
        return refundRequestView({ ...record, claim: undefined }, { operator });
    } catch (error) {
        // A proved absence of a first attempt allows a fresh review. A persisted
        // attempt or uncertain write never resets the provider claim.
        await RefundRequest.updateOne(
            { ...ownedClaim, state: "approved", "refund.kind": "not-started" },
            {
                $set: { state: "review-required", access: "unchanged" },
                $inc: { revision: 1 },
            },
        );
        throw error;
    } finally {
        await RefundRequest.updateOne(ownedClaim, {
            $unset: { claim: "" },
            $inc: { revision: 1 },
        });
    }
}
