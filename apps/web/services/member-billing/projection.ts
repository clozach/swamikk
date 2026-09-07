import type { InternalBillingCancellation } from "@/models/BillingCancellation";
import type { BillingCancellationView, BillingRefundView } from "./types";
import { settledBillingRefund } from "./refund";

export function cancellationView(
    record: InternalBillingCancellation,
    readOnly = false,
    now = new Date(),
): BillingCancellationView {
    const quote = record.quote;
    let refund: BillingRefundView = { kind: "not-started" };
    if (record.refund.kind === "claimed") refund = { kind: "uncertain" };
    if (record.refund.kind === "result") {
        const result = record.refund.result;
        refund =
            result.kind === "refund"
                ? {
                      kind: "refund",
                      status: result.status,
                      amount: result.amount,
                      currency: result.currency,
                  }
                : result;
    }
    const processing = !!record.claim && new Date(record.claim.expiresAt) > now;
    const settledRefund = settledBillingRefund(record.refund);
    const phase = processing
        ? "processing"
        : record.cancellation.kind === "preparing"
          ? "uncertain"
          : record.cancellation.kind;
    return {
        operationId: record.operationId,
        phase,
        ...(record.cancellation.kind === "review-required"
            ? { reason: record.cancellation.reason }
            : {}),
        quote: {
            hash: quote.quoteHash,
            expiresAt: new Date(record.expiresAt).toISOString(),
            currency: quote.currency,
            mode: quote.mode,
            paidAmount: quote.paidAmount,
            alreadyRefundedAmount: quote.refundedAmount,
            refundAmount: quote.refundableAmount,
            payment: quote.payment,
            period: {
                start: new Date(quote.period.start * 1000).toISOString(),
                end: new Date(quote.period.end * 1000).toISOString(),
            },
            consequences: record.consequences,
        },
        refund:
            processing && record.refund.kind === "claimed"
                ? { kind: "processing" }
                : refund,
        access: record.access,
        canConfirm:
            !readOnly &&
            !processing &&
            phase === "quoted" &&
            new Date(record.expiresAt) > now,
        canReconcile:
            !readOnly &&
            !processing &&
            phase !== "quoted" &&
            !(
                phase === "canceled" &&
                record.access === "ended" &&
                settledRefund
            ),
        closingGift:
            record.cancellation.kind === "canceled" && record.access === "ended"
                ? {
                      consequences: record.consequences,
                      libraryHref: "/dashboard/my-content",
                  }
                : null,
        updatedAt: new Date(record.updatedAt).toISOString(),
    };
}
