import {
    allChargeRefunds,
    CancellationReview,
    providerId,
    refundSnapshot,
    refundStatus,
    stableJson,
} from "@/payments-new/cancellation/validation";
import { provePurchasePayment } from "./provider-proof";
import { purchaseQuoteHash } from "./provider-quote";
import {
    PurchaseRefundReview,
    requireRefund,
    type PurchaseRefundClient,
    type PurchaseRefundQuote,
    type PurchaseRefundResult,
} from "./provider-types";

/** Only a durable first-attempt claim may pass allowCreate=true. Never reset it after uncertainty. */
export async function reconcilePurchaseRefund(
    client: PurchaseRefundClient,
    input: {
        quote: PurchaseRefundQuote;
        operationId: string;
        firstAttemptAt: string;
        allowCreate: boolean;
        now?: Date;
    },
): Promise<PurchaseRefundResult> {
    const { quote, operationId } = input;
    const amount = quote.refundAmount ?? quote.refundableAmount;
    try {
        requireRefund(
            quote.kind === "stripe-purchase-refund" &&
                quote.version === 1 &&
                quote.hash === purchaseQuoteHash(quote),
            "invalid-quote",
        );
        requireRefund(
            /^[a-zA-Z0-9_-]{1,100}$/.test(operationId),
            "operation-mismatch",
        );
        requireRefund(
            Number.isSafeInteger(amount) &&
                amount >= 0 &&
                amount <= quote.refundableAmount &&
                (amount > 0 || quote.refundableAmount === 0),
            "refund-amount-invalid",
        );
        const proof = await provePurchasePayment(client, quote);
        requireRefund(
            proof.charge.id === quote.chargeId &&
                proof.paymentIntentId === quote.paymentIntentId &&
                proof.customerId === quote.customerId,
            "payment-mismatch",
        );
        const refunds = await allChargeRefunds(client, quote.chargeId);
        const matching = refunds.filter(
            (refund) => refund.metadata?.kk_purchase_refund === operationId,
        );
        requireRefund(matching.length <= 1, "operation-mismatch");
        if (matching.length === 1) {
            const refund = matching[0];
            requireRefund(
                refund.metadata?.kk_purchase_quote === quote.hash &&
                    refund.amount === amount &&
                    refund.currency === quote.currency,
                "operation-mismatch",
            );
            return {
                kind: "refund",
                refundId: refund.id,
                status: refundStatus(refund.status),
                amount: refund.amount,
                currency: refund.currency,
            };
        }
        const snapshot = refundSnapshot(refunds, quote.currency);
        if (quote.refundableAmount === 0) {
            requireRefund(
                proof.charge.amount_refunded === quote.paidAmount &&
                    snapshot
                        .filter((refund) => refund.status === "succeeded")
                        .reduce((sum, refund) => sum + refund.amount, 0) ===
                        quote.paidAmount,
                "refund-history-incomplete",
            );
            return { kind: "not-required", reason: "already-refunded" };
        }
        if (!input.allowCreate) return { kind: "uncertain" };
        const elapsed =
            (input.now || new Date()).getTime() -
            Date.parse(input.firstAttemptAt);
        requireRefund(
            Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 10 * 60000,
            "operation-mismatch",
        );
        requireRefund(
            proof.charge.amount_refunded === quote.refundedAmount &&
                proof.charge.amount - proof.charge.amount_refunded ===
                    quote.refundableAmount &&
                stableJson(snapshot) === stableJson(quote.existingRefunds),
            "amount-changed",
        );
        const refund = await client.refunds.create(
            {
                charge: quote.chargeId,
                amount,
                metadata: {
                    kk_purchase_refund: operationId,
                    kk_purchase_quote: quote.hash,
                    kk_purchase_invoice: quote.invoiceId,
                },
            },
            { idempotencyKey: `kk-purchase-refund:${operationId}` },
        );
        requireRefund(
            providerId(refund.charge) === quote.chargeId &&
                refund.amount === amount &&
                refund.currency === quote.currency &&
                refund.metadata?.kk_purchase_refund === operationId &&
                refund.metadata?.kk_purchase_quote === quote.hash,
            "operation-mismatch",
        );
        return {
            kind: "refund",
            refundId: refund.id,
            status: refundStatus(refund.status),
            amount: refund.amount,
            currency: refund.currency,
        };
    } catch (error) {
        if (
            error instanceof PurchaseRefundReview ||
            error instanceof CancellationReview
        )
            return { kind: "review-required", reason: error.reason };
        const type = (error as { type?: string })?.type;
        return [
            "StripeInvalidRequestError",
            "StripeAuthenticationError",
            "StripePermissionError",
            "StripeCardError",
        ].includes(type || "")
            ? { kind: "review-required", reason: "provider-rejected" }
            : { kind: "uncertain" };
    }
}
