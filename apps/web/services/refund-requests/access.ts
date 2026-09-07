import type { InternalRefundRequest } from "@/models/RefundRequest";
import { requireCondition } from "@/services/content-changes/errors";

export function requireApprovedRefundAccess(record: InternalRefundRequest) {
    requireCondition(
        record.accessDecision === "preserve-access",
        "needs_review",
        "The access consequence needs an approved implementation before a refund can be applied.",
        409,
    );
}
export async function applyRefundAccess(record: InternalRefundRequest) {
    requireApprovedRefundAccess(record);
    // Preserving access deliberately leaves this purchase, other purchases and subscription untouched.
}
