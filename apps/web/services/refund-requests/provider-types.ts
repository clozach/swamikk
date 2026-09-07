import type Stripe from "stripe";
import type {
    ExistingStripeRefund,
    StripeMonthlyRefundResult,
} from "@/payments-new/cancellation";

export type PurchaseRefundClient = Pick<
    Stripe,
    "checkout" | "paymentIntents" | "charges" | "refunds"
>;
/** Internal only: the caller obtains these values from an owned native invoice. */
export interface PurchaseRefundInput {
    invoiceId: string;
    membershipId: string;
    membershipSessionId: string;
    checkoutSessionId: string;
    paidAmount: number;
    currency: string;
    mode: "test" | "live";
}
export interface PurchaseRefundQuote extends PurchaseRefundInput {
    kind: "stripe-purchase-refund";
    version: 1;
    hash: string;
    paymentIntentId: string;
    chargeId: string;
    customerId: string | null;
    refundedAmount: number;
    refundableAmount: number;
    /** Explicit reviewed amount; absent on old full-remaining attempts. */
    refundAmount?: number;
    existingRefunds: ExistingStripeRefund[];
    capturedAt: string;
}
export type PurchaseRefundQuoteResult =
    | { kind: "ready"; quote: PurchaseRefundQuote }
    | { kind: "review-required"; reason: string }
    | { kind: "unavailable" };
export type PurchaseRefundResult =
    | Exclude<StripeMonthlyRefundResult, { kind: "not-required" }>
    | { kind: "not-required"; reason: "already-refunded" }
    | { kind: "review-required"; reason: string };

export class PurchaseRefundReview extends Error {
    constructor(public reason: string) {
        super(reason);
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = "PurchaseRefundReview";
    }
}
export function requireRefund(
    condition: unknown,
    reason: string,
): asserts condition {
    if (!condition) throw new PurchaseRefundReview(reason);
}
