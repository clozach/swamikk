/** Browser-safe billing contract. All monetary quote amounts use Stripe minor units. */
export interface BillingConsequenceView {
    kind: "known" | "partly-unknown";
    retainedCount: number;
    unknownReleaseCount: number;
    unknownCourseCount: number;
    archiveAccess: "ends-on-cancellation";
    futureDrops: "stop-on-cancellation";
    cutoff: string | null;
}
export interface BillingQuoteView {
    hash: string;
    expiresAt: string;
    currency: string;
    mode: "test" | "live";
    paidAmount: number;
    alreadyRefundedAmount: number;
    refundAmount: number;
    payment: "paid" | "unpaid";
    period: { start: string; end: string };
    consequences: BillingConsequenceView;
}
export type BillingRefundView =
    | { kind: "not-started" }
    | { kind: "processing" }
    | { kind: "uncertain" }
    | {
          kind: "not-required";
          reason: "current-month-unpaid" | "already-refunded";
      }
    | { kind: "review-required"; reason: string }
    | {
          kind: "refund";
          status:
              | "pending"
              | "succeeded"
              | "failed"
              | "canceled"
              | "requires_action";
          amount: number;
          currency: string;
      };
export interface BillingCancellationView {
    operationId: string;
    phase:
        | "quoted"
        | "processing"
        | "uncertain"
        | "canceled"
        | "review-required";
    reason?: string;
    quote: BillingQuoteView;
    refund: BillingRefundView;
    access: "unchanged" | "capped" | "ended";
    canConfirm: boolean;
    canReconcile: boolean;
    closingGift: null | {
        consequences: BillingConsequenceView;
        libraryHref: "/dashboard/my-content";
    };
    updatedAt: string;
}
export interface BillingInvoiceView {
    invoiceId: string;
    /** Existing native invoice amounts are major currency units. */
    amount: number;
    currency: string;
    mode: "test" | "live" | "unknown";
    status: string;
    paidAt: string | null;
    receipt: { kind: "available"; href: string } | { kind: "unavailable" };
}
export interface BillingMembershipView {
    membershipId: string;
    productName: string;
    planName: string;
    status: string;
    planType: string;
    invoices: BillingInvoiceView[];
    consequences: BillingConsequenceView;
    cancellation: BillingCancellationView | null;
    cancellationEligibility:
        | { kind: "available" }
        | { kind: "review-required"; reason: string }
        | { kind: "unavailable"; reason: string };
}
export interface MemberBillingView {
    readOnly: boolean;
    memberships: BillingMembershipView[];
}
export type MemberBillingCommand =
    | { action: "prepare"; membershipId: string }
    | {
          action: "confirm" | "reconcile";
          operationId: string;
          quoteHash: string;
      };
export type MemberBillingCommandResult =
    | { kind: "operation"; operation: BillingCancellationView }
    | { kind: "review-required"; reason: string }
    | { kind: "unavailable" };
