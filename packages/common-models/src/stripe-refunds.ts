export type StripeRefundStatus =
    | "pending"
    | "requires_action"
    | "succeeded"
    | "failed"
    | "canceled";

export interface StripeRefundObservation {
    refundId: string;
    amount: number;
    currency: string;
    status: StripeRefundStatus;
    createdAt: Date;
}

/** Captured around provider reads; these identify native money observations, not wall-clock ordering. */
export interface NativeRefundBaseline {
    kind: "request" | "cancellation";
    id: string;
    revision: number;
    observationId?: string;
    refund: string;
}

/** Financial evidence, never a member action or an access instruction. Amounts use Stripe charge units. */
export interface StripeChargeRefunds {
    mode: "test" | "live";
    chargeId: string;
    paymentIntentId: string;
    customerId: string | null;
    providerInvoiceId: string | null;
    invoiceId: string;
    nativeTransactionId: string;
    membershipId: string;
    membershipSessionId: string;
    userId: string;
    currency: string;
    chargedAmount: number;
    state:
        | { kind: "bound" }
        | {
              kind: "observed";
              refunds: StripeRefundObservation[];
              refundedAmount: number;
              observedAt: Date;
              nativeBaselines?: NativeRefundBaseline[];
          };
    /** Recovery requires proof that this worker cannot resume. */
    claim?: { id: string; eventId: string; startedAt: Date };
    revision: number;
    createdAt: Date;
    updatedAt: Date;
}

/** No charge, refund, customer, session or payment method IDs cross the member boundary. Amounts are major units. */
export type MemberRefundSummary =
    | { kind: "unrecorded" }
    | {
          kind: "observed";
          currency: string;
          refundedAmount: number;
          refunds: { status: StripeRefundStatus; amount: number }[];
          observedAt: string;
      };
