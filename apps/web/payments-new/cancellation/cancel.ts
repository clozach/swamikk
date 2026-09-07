import type {
    StripeCancellationClient,
    StripeMonthlyCancellationQuote,
    StripeSubscriptionCancellationResult,
} from "./types";
import {
    CancellationReview,
    providerId,
    requireProvider,
    validateQuote,
} from "./validation";
import { validateMonthlySubscription } from "./provider-checks";

export async function cancelStripeMonthlySubscription(
    stripe: StripeCancellationClient,
    quote: StripeMonthlyCancellationQuote,
): Promise<StripeSubscriptionCancellationResult> {
    try {
        validateQuote(quote);
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
        if (sub.status === "canceled")
            return {
                kind: "canceled",
                subscriptionId: sub.id,
                alreadyCanceled: true,
            };
        const { item } = validateMonthlySubscription(sub, {
            subscriptionId: quote.subscriptionId,
            customerId: quote.customerId,
            expectedLivemode: quote.mode === "live",
            paymentPlanType: "subscription",
        });
        requireProvider(
            item.id === quote.subscriptionItemId,
            "unsupported-subscription",
        );
        requireProvider(
            sub.current_period_start === quote.period.start &&
                sub.current_period_end === quote.period.end &&
                providerId(sub.latest_invoice) === quote.invoiceId,
            "period-changed",
        );
        const invoice = await stripe.invoices.retrieve(quote.invoiceId);
        requireProvider(
            invoice.id === quote.invoiceId &&
                invoice.livemode === sub.livemode &&
                providerId(invoice.subscription) === sub.id &&
                providerId(invoice.customer) === quote.customerId &&
                invoice.amount_paid === quote.paidAmount &&
                invoice.currency === quote.currency &&
                providerId(invoice.charge) === quote.chargeId,
            "amount-changed",
        );
        const canceled = await stripe.subscriptions.cancel(sub.id, {
            invoice_now: false,
            prorate: false,
        });
        requireProvider(
            canceled.id === sub.id &&
                canceled.status === "canceled" &&
                providerId(canceled.customer) === quote.customerId &&
                canceled.livemode === sub.livemode,
            "provider-rejected",
        );
        return {
            kind: "canceled",
            subscriptionId: canceled.id,
            alreadyCanceled: false,
        };
    } catch (error) {
        return error instanceof CancellationReview
            ? { kind: "review-required", reason: error.reason }
            : { kind: "uncertain" };
    }
}
