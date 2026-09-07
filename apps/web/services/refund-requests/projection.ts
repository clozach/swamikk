import { createHash } from "crypto";
import type { InternalRefundRequest } from "@/models/RefundRequest";
import { stableJson } from "@/payments-new/cancellation/validation";
import type { RefundRequestView } from "./types";

export function refundReviewHash(
    record: Pick<
        InternalRefundRequest,
        | "requestId"
        | "attemptId"
        | "invoiceId"
        | "reason"
        | "quote"
        | "routing"
        | "classEvidence"
        | "accessDecision"
        | "assignedTo"
    >,
) {
    return createHash("sha256")
        .update(
            stableJson({
                requestId: record.requestId,
                attemptId: record.attemptId || record.requestId,
                invoiceId: record.invoiceId,
                reason: record.reason,
                quoteHash: record.quote?.hash || null,
                routing: record.routing,
                classEvidence: record.classEvidence
                    ? {
                          ...record.classEvidence,
                          classStart: new Date(
                              record.classEvidence.classStart,
                          ).toISOString(),
                      }
                    : null,
                accessDecision: record.accessDecision,
                assignedTo: record.assignedTo,
            }),
        )
        .digest("hex");
}
export function refundRequestView(
    record: InternalRefundRequest,
    options: { readOnly?: boolean; operator?: boolean; now?: Date } = {},
): RefundRequestView {
    const now = options.now || new Date();
    const busy = !!record.claim && new Date(record.claim.expiresAt) > now;
    let refund: RefundRequestView["refund"] = { kind: "not-started" };
    if (record.refund.kind === "claimed")
        refund = { kind: busy ? "processing" : "uncertain" };
    if (record.refund.kind === "result") {
        const result = record.refund.result;
        refund =
            result.kind === "refund"
                ? { kind: "refund", status: result.status }
                : result.kind === "not-required"
                  ? { kind: "already-refunded" }
                  : result;
    }
    const mayReview =
        !options.readOnly &&
        !!options.operator &&
        !busy &&
        ["submitted", "review-required"].includes(record.state) &&
        record.refund.kind === "not-started";
    const result =
        record.refund.kind === "result" ? record.refund.result : undefined;
    const canReconcile =
        !result ||
        result.kind === "uncertain" ||
        result.kind === "not-required" ||
        (result.kind === "refund" &&
            ["pending", "requires_action", "succeeded"].includes(
                result.status,
            ));
    return {
        requestId: record.requestId,
        invoiceId: record.invoiceId,
        productName: record.productName,
        reason: record.reason,
        state: busy ? "processing" : record.state,
        routing: record.routing,
        assignedTo: record.assignedTo,
        quote:
            record.quote && record.quoteExpiresAt
                ? {
                      hash: record.quote.hash,
                      expiresAt: new Date(record.quoteExpiresAt).toISOString(),
                      amount:
                          record.quote.refundAmount ??
                          record.quote.refundableAmount,
                      remainingAmount: record.quote.refundableAmount,
                      paidAmount: record.quote.paidAmount,
                      alreadyRefundedAmount: record.quote.refundedAmount,
                      currency: record.quote.currency,
                      mode: record.quote.mode,
                  }
                : null,
        consequences: {
            accessDecision: record.accessDecision,
            affectsSubscription: false,
            otherPurchases: "unchanged",
            classStart: record.classEvidence
                ? new Date(record.classEvidence.classStart).toISOString()
                : null,
            timeZone: "UTC",
            explanation:
                record.accessDecision === "policy-pending"
                    ? "The access consequence needs a policy decision before a refund can be applied."
                    : record.accessDecision === "preserve-access"
                      ? "Access to this purchase stays available after the refund."
                      : record.quote &&
                          (record.quote.refundAmount ??
                              record.quote.refundableAmount) <
                              record.quote.refundableAmount
                        ? "This partial refund keeps this purchase’s access. A later confirmed full refund ends only this purchase’s access."
                        : "Once confirmed successful refunds total the original payment, access granted by this purchase ends. Other purchases, a later rejoin and monthly membership stay unchanged.",
        },
        refund,
        access: record.access,
        notification: {
            kind: "private-review-queue",
            delivery: "not-configured",
        },
        reviewHash: record.reviewHash,
        decisionExplanation: record.decision?.explanation || null,
        submittedAt: record.submittedAt
            ? new Date(record.submittedAt).toISOString()
            : null,
        updatedAt: new Date(record.updatedAt).toISOString(),
        canSubmit:
            !options.readOnly &&
            !options.operator &&
            !busy &&
            record.state === "draft",
        canReconcile:
            !options.readOnly &&
            !busy &&
            record.state === "approved" &&
            canReconcile,
        canApprove:
            mayReview &&
            !!record.quote &&
            !!record.quoteExpiresAt &&
            new Date(record.quoteExpiresAt) > now &&
            record.accessDecision !== "policy-pending",
        canDecline: mayReview,
        canEscalate: mayReview && record.assignedTo === "Al",
        receiptHref: `/dashboard/receipts/${encodeURIComponent(record.invoiceId)}`,
    };
}
