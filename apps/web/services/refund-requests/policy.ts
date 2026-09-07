import type { RefundRouting, RefundAccessDecision } from "./types";

export const CLASS_REFUND_NOTICE_MS = 14 * 24 * 60 * 60 * 1000;
/** Eligibility uses the durable submission time, not a later operator review time. */
export function refundRouting(input: {
    verifiedClassStart?: Date;
    classEvidenceUnknown: boolean;
    requestedAt: Date;
}): RefundRouting {
    if (input.classEvidenceUnknown) return "evidence-review";
    if (!input.verifiedClassStart) return "purchase-review";
    const start = input.verifiedClassStart.getTime();
    if (!Number.isFinite(start)) return "evidence-review";
    return start - input.requestedAt.getTime() >= CLASS_REFUND_NOTICE_MS
        ? "class-automatic"
        : "class-review";
}

// Al approved full purchase/class refund ending only its grant; partial keeps it.
export const approvedRefundAccessDecision: RefundAccessDecision =
    "end-refunded-access";
