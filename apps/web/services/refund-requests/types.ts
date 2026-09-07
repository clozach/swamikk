import type { MemberRefundSummary } from "../../../../packages/common-models/src/stripe-refunds";
/** Browser-safe M07/O10 DTOs. Quote amounts are Stripe minor currency units. */
export type RefundRouting =
    | "purchase-review"
    | "class-review"
    | "class-automatic"
    | "evidence-review";
export type RefundAccessDecision =
    | "policy-pending"
    | "preserve-access"
    | "end-refunded-access";
export interface RefundMoneyView {
    hash: string;
    expiresAt: string;
    amount: number;
    paidAmount: number;
    alreadyRefundedAmount: number;
    currency: string;
    mode: "test" | "live";
}
export interface RefundConsequencesView {
    accessDecision: RefundAccessDecision;
    affectsSubscription: false;
    otherPurchases: "unchanged";
    classStart: string | null;
    timeZone: "UTC";
    explanation: string;
}
export interface RefundRequestView {
    refundSummary?: MemberRefundSummary;
    requestId: string;
    invoiceId: string;
    productName: string;
    reason: string;
    state:
        | "draft"
        | "submitted"
        | "approved"
        | "declined"
        | "processing"
        | "complete"
        | "review-required";
    routing: RefundRouting;
    assignedTo: "Al" | "KK";
    quote: RefundMoneyView | null;
    consequences: RefundConsequencesView;
    refund:
        | {
              kind:
                  | "not-started"
                  | "uncertain"
                  | "processing"
                  | "already-refunded";
          }
        | {
              kind: "refund";
              status:
                  | "pending"
                  | "succeeded"
                  | "failed"
                  | "canceled"
                  | "requires_action";
          }
        | { kind: "review-required"; reason: string };
    access: "unchanged" | "pending" | "resolved";
    notification: { kind: "private-review-queue"; delivery: "not-configured" };
    reviewHash: string;
    decisionExplanation: string | null;
    submittedAt: string | null;
    updatedAt: string;
    canSubmit: boolean;
    canReconcile: boolean;
    canApprove: boolean;
    canDecline: boolean;
    canEscalate: boolean;
    receiptHref: string;
}
export interface RefundProductView {
    refundSummary?: MemberRefundSummary;
    invoiceId: string;
    productName: string;
    amount: number;
    currency: string;
    mode: "test" | "live" | "unknown";
    request: RefundRequestView | null;
    receiptHref: string;
}
export interface MemberRefundRequestsView {
    readOnly: boolean;
    products: RefundProductView[];
    membershipHref: "/dashboard/membership";
}
export interface OperatorRefundRequestsView {
    requests: RefundRequestView[];
}
export interface RefundBookingChoicesView {
    invoiceId: string;
    choices: {
        cohortId: string;
        name: string;
        startAt: string | null;
        timeZone: "UTC";
    }[];
}
export type RefundRequestCommand =
    | { action: "prepare"; invoiceId: string; reason: string }
    | { action: "submit" | "reconcile"; requestId: string; reviewHash: string }
    | { action: "review"; requestId: string }
    | {
          action: "approve" | "decline" | "escalate";
          requestId: string;
          reviewHash: string;
          explanation: string;
      }
    | {
          action: "verify-class";
          invoiceId: string;
          cohortId: string;
          explanation: string;
          bookingVerified: true;
      };
