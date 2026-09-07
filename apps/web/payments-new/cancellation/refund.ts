import type Stripe from "stripe";
import type {
    ReconcileStripeMonthlyRefundInput,
    StripeCancellationClient,
    StripeMonthlyRefundResult,
} from "./types";
import {
    CancellationReview,
    allChargeRefunds,
    providerId,
    refundSnapshot,
    refundStatus,
    requireProvider,
    validateQuote,
    stableJson,
} from "./validation";
import { validateCharge } from "./provider-checks";

const resultFor = (refund: Stripe.Refund): StripeMonthlyRefundResult => ({
    kind: "refund",
    refundId: refund.id,
    status: refundStatus(refund.status),
    amount: refund.amount,
    currency: refund.currency,
});

/** Caller durably claims a first attempt before allowCreate=true; every later call is read-only reconciliation. */
export async function reconcileStripeMonthlyRefund(
    stripe: StripeCancellationClient,
    input: ReconcileStripeMonthlyRefundInput,
): Promise<StripeMonthlyRefundResult> {
    const { quote, operationId } = input;
    try {
        validateQuote(quote);
        requireProvider(
            /^[a-zA-Z0-9_-]{1,100}$/.test(operationId),
            "operation-mismatch",
        );
        const sub = await stripe.subscriptions.retrieve(quote.subscriptionId);
        requireProvider(
            sub.id === quote.subscriptionId &&
                providerId(sub.customer) === quote.customerId,
            "customer-mismatch",
        );
        requireProvider(
            sub.livemode === (quote.mode === "live"),
            "mode-mismatch",
        );
        requireProvider(sub.status === "canceled", "subscription-not-canceled");
        // Reconciliation deliberately uses the frozen invoice, never latest_invoice
        // or today's period. Canceled subscriptions remain reconcilable later.
        const invoice = await stripe.invoices.retrieve(quote.invoiceId);
        requireProvider(
            invoice.id === quote.invoiceId &&
                providerId(invoice.subscription) === sub.id &&
                providerId(invoice.customer) === quote.customerId &&
                invoice.currency === quote.currency &&
                invoice.livemode === sub.livemode,
            "invoice-mismatch",
        );
        requireProvider(
            invoice.amount_paid === quote.paidAmount,
            "amount-changed",
        );
        if (quote.payment === "unpaid") {
            requireProvider(
                !invoice.paid &&
                    !providerId(invoice.charge) &&
                    quote.chargeId === null,
                "amount-changed",
            );
            return { kind: "not-required", reason: "current-month-unpaid" };
        }
        requireProvider(
            quote.chargeId && providerId(invoice.charge) === quote.chargeId,
            "charge-mismatch",
        );
        const charge = await stripe.charges.retrieve(quote.chargeId);
        validateCharge(charge, invoice, quote.customerId);
        const refunds = await allChargeRefunds(stripe, charge.id);
        const matching = refunds.filter(
            (r) => r.metadata?.kk_cancellation_operation === operationId,
        );
        requireProvider(matching.length <= 1, "operation-mismatch");
        if (matching.length === 1) {
            const refund = matching[0];
            requireProvider(
                refund.metadata?.kk_cancellation_quote === quote.quoteHash &&
                    refund.amount === quote.refundableAmount &&
                    refund.currency === quote.currency &&
                    providerId(refund.charge) === quote.chargeId,
                "operation-mismatch",
            );
            return resultFor(refund);
        }
        const snapshot = refundSnapshot(refunds, quote.currency);
        if (quote.refundableAmount === 0) {
            requireProvider(
                charge.amount_refunded === quote.paidAmount &&
                    snapshot
                        .filter((r) => r.status === "succeeded")
                        .reduce((sum, r) => sum + r.amount, 0) ===
                        quote.paidAmount,
                "refund-in-progress",
            );
            return { kind: "not-required", reason: "already-refunded" };
        }
        // No matching refund is not proof a timed-out create did nothing. Stripe
        // idempotency keys can be pruned; never recreate on a later reconciliation.
        if (!input.allowCreate) return { kind: "uncertain" };
        const elapsed =
            (input.now || new Date()).getTime() -
            Date.parse(input.firstAttemptAt);
        requireProvider(
            Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 10 * 60000,
            "operation-mismatch",
        );
        requireProvider(
            charge.amount_refunded === quote.refundedAmount &&
                charge.amount - charge.amount_refunded ===
                    quote.refundableAmount &&
                stableJson(snapshot) === stableJson(quote.existingRefunds),
            "amount-changed",
        );
        const refund = await stripe.refunds.create(
            {
                charge: quote.chargeId,
                amount: quote.refundableAmount,
                metadata: {
                    kk_cancellation_operation: operationId,
                    kk_cancellation_quote: quote.quoteHash,
                    kk_cancellation_invoice: quote.invoiceId,
                },
            },
            { idempotencyKey: `kk-cancel-refund:${operationId}` },
        );
        requireProvider(
            providerId(refund.charge) === quote.chargeId &&
                refund.amount === quote.refundableAmount &&
                refund.currency === quote.currency &&
                refund.metadata?.kk_cancellation_operation === operationId &&
                refund.metadata?.kk_cancellation_quote === quote.quoteHash,
            "operation-mismatch",
        );
        return resultFor(refund);
    } catch (error) {
        if (error instanceof CancellationReview)
            return { kind: "review-required", reason: error.reason };
        // A connection failure, timeout or 5xx may follow provider acceptance.
        // Even a definite rejection is left to orchestration for an explicit
        // review; this adapter never rolls a new refund operation automatically.
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
