import { withObservedRefund } from "@/payments-new/stripe-lifecycle/refund-projection";
import type { OverviewRecords } from "./load";
import { effectiveRefunds } from "./payments";
import { attentionRecord, type PendingAttention } from "./attention-record";

/** Refund attention uses the same freshness comparison as the money summary. */
export function refundAttention(
    records: OverviewRecords,
    domain: string,
): PendingAttention[] {
    const result: PendingAttention[] = [];
    const evidence = effectiveRefunds(records);
    const nativeAttentionCharges = new Set<string>();
    for (const raw of [
        ...records.cancellations.rows,
        ...records.requests.rows,
    ]) {
        const record = withObservedRefund(raw, evidence);
        const request = "requestId" in record;
        const source = request ? "refund-requests" : "cancellations";
        const id = request ? record.requestId : record.operationId;
        const refund =
            record.refund.kind === "result" ? record.refund.result : null;
        const refundStatus = refund?.kind === "refund" ? refund.status : null;
        const refundAttention = refundStatus && refundStatus !== "succeeded";
        const refundNeedsReview =
            (refundStatus &&
                !["succeeded", "pending"].includes(refundStatus)) ||
            refund?.kind === "review-required";
        const needsReview = request
            ? ["submitted", "approved", "review-required"].includes(
                  record.state,
              )
            : ["uncertain", "review-required"].includes(
                  record.cancellation.kind,
              );
        const pending = request
            ? !!record.claim
            : ["preparing", "uncertain"].includes(record.cancellation.kind) ||
              !!record.claim;
        if (
            needsReview ||
            pending ||
            refundAttention ||
            refund?.kind === "uncertain" ||
            refund?.kind === "review-required"
        ) {
            if (record.quote?.chargeId)
                nativeAttentionCharges.add(record.quote.chargeId);
            result.push(
                attentionRecord(
                    domain,
                    source,
                    id,
                    refundNeedsReview
                        ? "refund-review"
                        : needsReview
                          ? request
                              ? "refund-review"
                              : "cancellation-review"
                          : "refund-processing",
                    refundStatus ||
                        (refund?.kind === "uncertain" ||
                        refund?.kind === "review-required"
                            ? refund.kind
                            : request
                              ? record.state
                              : record.cancellation.kind),
                    record.updatedAt,
                    request ? "/dashboard/refund-review" : "/dashboard/support",
                    record.userId,
                    record.quote?.mode,
                ),
            );
        }
    }
    for (const ledger of evidence) {
        if (nativeAttentionCharges.has(ledger.chargeId)) continue;
        const states =
            ledger.state.kind === "observed"
                ? ledger.state.refunds
                      .map((refund) => refund.status)
                      .filter((status) => status !== "succeeded")
                : [];
        if (ledger.claim || ledger.state.kind === "bound" || states.length)
            result.push(
                attentionRecord(
                    domain,
                    "refunds",
                    ledger.chargeId,
                    states.some((status) => status !== "pending")
                        ? "refund-review"
                        : "refund-processing",
                    ledger.claim
                        ? "reconciling"
                        : states.join(", ") || "unrecorded",
                    ledger.updatedAt,
                    "/dashboard/transactions",
                    ledger.userId,
                    ledger.mode,
                ),
            );
    }
    return result;
}
