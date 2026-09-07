import type Stripe from "stripe";

export type StripeCancellationClient = Pick<
    Stripe,
    "subscriptions" | "invoices" | "charges" | "refunds"
>;
export type RefundStatus =
    | "pending"
    | "succeeded"
    | "failed"
    | "canceled"
    | "requires_action";
export interface ExistingStripeRefund {
    id: string;
    amount: number;
    status: RefundStatus;
}

/** Internal, server-persisted quote. Provider identifiers never come from a browser. */
export interface StripeMonthlyCancellationQuote {
    kind: "stripe-monthly-cancellation";
    version: 1;
    quoteHash: string;
    subscriptionId: string;
    customerId: string;
    subscriptionItemId: string;
    invoiceId: string;
    chargeId: string | null;
    currency: string;
    mode: "live" | "test";
    period: { start: number; end: number };
    payment: "paid" | "unpaid";
    paidAmount: number;
    refundedAmount: number;
    refundableAmount: number;
    existingRefunds: ExistingStripeRefund[];
    capturedAt: string;
}
export interface PrepareStripeMonthlyCancellationInput {
    subscriptionId: string;
    customerId?: string;
    paymentPlanType: string;
    expectedLivemode: boolean;
    expectedMembershipId?: string;
    now?: Date;
}
export type StripeCancellationReviewReason =
    | "unsupported-plan"
    | "unsupported-subscription"
    | "customer-mismatch"
    | "mode-mismatch"
    | "membership-mismatch"
    | "no-current-invoice"
    | "invoice-mismatch"
    | "complex-invoice"
    | "charge-mismatch"
    | "complex-charge"
    | "refund-in-progress"
    | "refund-history-incomplete"
    | "invalid-quote"
    | "period-changed"
    | "amount-changed"
    | "operation-mismatch"
    | "provider-rejected"
    | "subscription-not-canceled";
export type StripeCancellationReview = {
    kind: "review-required";
    reason: StripeCancellationReviewReason;
};
export type StripeCancellationQuoteResult =
    | { kind: "ready"; quote: StripeMonthlyCancellationQuote }
    | StripeCancellationReview
    | { kind: "unavailable" };
export type StripeSubscriptionCancellationResult =
    | { kind: "canceled"; subscriptionId: string; alreadyCanceled: boolean }
    | StripeCancellationReview
    | { kind: "uncertain" };
export type StripeMonthlyRefundResult =
    | {
          kind: "refund";
          refundId: string;
          status: RefundStatus;
          amount: number;
          currency: string;
      }
    | {
          kind: "not-required";
          reason: "current-month-unpaid" | "already-refunded";
      }
    | StripeCancellationReview
    | { kind: "uncertain" };
export interface ReconcileStripeMonthlyRefundInput {
    quote: StripeMonthlyCancellationQuote;
    operationId: string;
    /** Persisted before the first create attempt, never reset following uncertainty. */
    firstAttemptAt: string;
    /** True only for a durably claimed first attempt. Reconciliation always uses false. */
    allowCreate: boolean;
    now?: Date;
}
