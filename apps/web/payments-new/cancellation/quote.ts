import {
    validateMonthlySubscription,
    validateInvoice,
    validateCharge,
} from "./provider-checks";
import type {
    PrepareStripeMonthlyCancellationInput,
    StripeCancellationClient,
    StripeCancellationQuoteResult,
    StripeMonthlyCancellationQuote,
} from "./types";
import {
    CancellationReview,
    allChargeRefunds,
    providerId,
    quoteHash,
    refundSnapshot,
    requireProvider,
} from "./validation";

export async function prepareStripeMonthlyCancellation(
    stripe: StripeCancellationClient,
    input: PrepareStripeMonthlyCancellationInput,
): Promise<StripeCancellationQuoteResult> {
    try {
        const sub = await stripe.subscriptions.retrieve(input.subscriptionId);
        requireProvider(sub.id === input.subscriptionId, "invoice-mismatch");
        const { customer, item } = validateMonthlySubscription(sub, input);
        const now = input.now || new Date();
        requireProvider(
            now.getTime() / 1000 >= sub.current_period_start &&
                now.getTime() / 1000 < sub.current_period_end,
            "period-changed",
        );
        const invoiceId = providerId(sub.latest_invoice);
        requireProvider(invoiceId, "no-current-invoice");
        const invoice = await stripe.invoices.retrieve(invoiceId);
        requireProvider(invoice.id === invoiceId, "invoice-mismatch");
        validateInvoice(invoice, sub, item.id, item.price.id, customer);
        const base = {
            kind: "stripe-monthly-cancellation" as const,
            version: 1 as const,
            subscriptionId: sub.id,
            customerId: customer,
            subscriptionItemId: item.id,
            invoiceId: invoice.id,
            currency: invoice.currency,
            mode: sub.livemode ? ("live" as const) : ("test" as const),
            period: {
                start: sub.current_period_start,
                end: sub.current_period_end,
            },
            capturedAt: now.toISOString(),
        };
        let value: Omit<StripeMonthlyCancellationQuote, "quoteHash">;
        if (
            invoice.amount_paid === 0 &&
            !invoice.paid &&
            ["open", "draft", "uncollectible"].includes(invoice.status || "") &&
            !providerId(invoice.charge)
        ) {
            value = {
                ...base,
                payment: "unpaid",
                chargeId: null,
                paidAmount: 0,
                refundedAmount: 0,
                refundableAmount: 0,
                existingRefunds: [],
            };
        } else {
            requireProvider(
                invoice.status === "paid" &&
                    invoice.paid &&
                    !invoice.paid_out_of_band &&
                    invoice.amount_remaining === 0 &&
                    invoice.amount_paid === invoice.total &&
                    invoice.amount_paid === invoice.amount_due &&
                    !invoice.starting_balance &&
                    !invoice.ending_balance,
                "complex-invoice",
            );
            const chargeId = providerId(invoice.charge);
            requireProvider(chargeId, "complex-invoice");
            const charge = await stripe.charges.retrieve(chargeId);
            validateCharge(charge, invoice, customer);
            const refunds = refundSnapshot(
                await allChargeRefunds(stripe, charge.id),
                charge.currency,
            );
            requireProvider(
                !refunds.some(
                    (r) =>
                        r.status === "pending" ||
                        r.status === "requires_action",
                ),
                "refund-in-progress",
            );
            requireProvider(
                refunds
                    .filter((r) => r.status === "succeeded")
                    .reduce((sum, r) => sum + r.amount, 0) ===
                    charge.amount_refunded,
                "refund-history-incomplete",
            );
            value = {
                ...base,
                payment: "paid",
                chargeId,
                paidAmount: charge.amount,
                refundedAmount: charge.amount_refunded,
                refundableAmount: charge.amount - charge.amount_refunded,
                existingRefunds: refunds,
            };
        }
        return {
            kind: "ready",
            quote: { ...value, quoteHash: quoteHash(value) },
        };
    } catch (error) {
        return error instanceof CancellationReview
            ? { kind: "review-required", reason: error.reason }
            : { kind: "unavailable" };
    }
}
