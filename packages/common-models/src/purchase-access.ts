import type { MembershipAccessKey } from "./member-access";

/** Private provider evidence. This is an access consequence, never a replacement receipt. */
export interface FullPurchaseRefundProof {
    invoiceId: string;
    chargeId: string;
    mode: "test" | "live";
    paidAmount: number;
    currency: string;
    refundIds: string[];
    observedAt: Date;
}
export interface PurchaseAccess extends MembershipAccessKey {
    state: "open" | "ending" | "ended";
    proof?: FullPurchaseRefundProof;
    /** Reservations never expire: a crashed writer requires explicit reconciliation. */
    writes: { id: string; startedAt: Date }[];
    observation?: { id: string; startedAt: Date };
    financialReviewRequired?: boolean;
    bookingReviewRequired?: boolean;
    endedAt?: Date;
    updatedAt: Date;
}
export type PurchaseAccessResult =
    | "unchanged"
    | "pending"
    | "ended"
    | "ended-booking-review"
    | "review-required";
