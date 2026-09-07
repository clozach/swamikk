import { createHash } from "crypto";
import {
    allChargeRefunds,
    CancellationReview,
    refundSnapshot,
    stableJson,
} from "@/payments-new/cancellation/validation";
import { provePurchasePayment } from "./provider-proof";
import {
    PurchaseRefundReview,
    requireRefund,
    type PurchaseRefundClient,
    type PurchaseRefundInput,
    type PurchaseRefundQuote,
    type PurchaseRefundQuoteResult,
} from "./provider-types";

export function purchaseQuoteHash(
    value: Omit<PurchaseRefundQuote, "hash"> | PurchaseRefundQuote,
) {
    const { hash: _ignored, ...quote } = value as PurchaseRefundQuote;
    return createHash("sha256").update(stableJson(quote)).digest("hex");
}
export async function preparePurchaseRefund(
    client: PurchaseRefundClient,
    input: PurchaseRefundInput,
    now = new Date(),
    refundAmount?: number,
): Promise<PurchaseRefundQuoteResult> {
    try {
        const { paymentIntentId, customerId, charge } =
            await provePurchasePayment(client, input);
        const existingRefunds = refundSnapshot(
            await allChargeRefunds(client, charge.id),
            charge.currency,
        );
        requireRefund(
            !existingRefunds.some(
                (refund) =>
                    refund.status === "pending" ||
                    refund.status === "requires_action",
            ),
            "refund-in-progress",
        );
        requireRefund(
            existingRefunds
                .filter((refund) => refund.status === "succeeded")
                .reduce((sum, refund) => sum + refund.amount, 0) ===
                charge.amount_refunded,
            "refund-history-incomplete",
        );
        requireRefund(
            refundAmount === undefined ||
                (Number.isSafeInteger(refundAmount) &&
                    refundAmount > 0 &&
                    refundAmount <= charge.amount - charge.amount_refunded &&
                    (!["isk", "ugx"].includes(input.currency) ||
                        refundAmount % 100 === 0)),
            "refund-amount-invalid",
        );
        const quote: Omit<PurchaseRefundQuote, "hash"> = {
            ...input,
            kind: "stripe-purchase-refund",
            version: 1,
            paymentIntentId,
            chargeId: charge.id,
            customerId,
            refundedAmount: charge.amount_refunded,
            refundableAmount: charge.amount - charge.amount_refunded,
            ...(refundAmount === undefined ? {} : { refundAmount }),
            existingRefunds,
            capturedAt: now.toISOString(),
        };
        return {
            kind: "ready",
            quote: { ...quote, hash: purchaseQuoteHash(quote) },
        };
    } catch (error) {
        if (
            error instanceof PurchaseRefundReview ||
            error instanceof CancellationReview
        )
            return { kind: "review-required", reason: error.reason };
        return { kind: "unavailable" };
    }
}
