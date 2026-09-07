import BillingCancellation, {
    type InternalBillingCancellation,
    type BillingRefundState,
} from "@/models/BillingCancellation";
import {
    reconcileStripeMonthlyRefund,
    type StripeCancellationClient,
} from "@/payments-new/cancellation";
import { requireCondition } from "@/services/content-changes/errors";
import { saveClaimed } from "./claims";

export function settledBillingRefund(refund: BillingRefundState) {
    if (refund.kind !== "result") return false;
    const result = refund.result;
    return (
        result.kind === "not-required" ||
        result.kind === "review-required" ||
        (result.kind === "refund" &&
            ["succeeded", "failed", "canceled"].includes(result.status))
    );
}
export async function advanceBillingRefund(
    record: InternalBillingCancellation,
    claimId: string,
    client: StripeCancellationClient,
    now: () => Date,
) {
    // This CAS is the sole permission to create a refund. A lost DB response
    // or process crash leaves 'claimed'; every recovery reconciles read-only.
    let allowCreate = false;
    if (record.refund.kind === "not-started") {
        const firstAttemptAt = now();
        const claimedRefund = await BillingCancellation.findOneAndUpdate(
            {
                domain: record.domain,
                userId: record.userId,
                operationId: record.operationId,
                "claim.id": claimId,
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
            claimedRefund,
            "conflict",
            "The refund is being reconciled. Refresh its status.",
            409,
        );
        record = claimedRefund;
        allowCreate = true;
    }
    const firstAttemptAt =
        record.refund.kind === "not-started"
            ? undefined
            : record.refund.firstAttemptAt;
    const result = await reconcileStripeMonthlyRefund(client, {
        quote: record.quote,
        operationId: record.operationId,
        firstAttemptAt: firstAttemptAt
            ? new Date(firstAttemptAt).toISOString()
            : now().toISOString(),
        allowCreate,
        now: now(),
    });
    return saveClaimed(
        record.operationId,
        claimId,
        {
            refund: {
                kind: "result",
                ...(firstAttemptAt ? { firstAttemptAt } : {}),
                result,
            },
        },
        now(),
    );
}
