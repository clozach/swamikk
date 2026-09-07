import type Stripe from "stripe";
import type { PrepareStripeMonthlyCancellationInput } from "./types";
import { minorAmount, providerId, requireProvider } from "./validation";

export function validateMonthlySubscription(
    sub: Stripe.Subscription,
    expected: PrepareStripeMonthlyCancellationInput,
) {
    requireProvider(
        expected.paymentPlanType === "subscription",
        "unsupported-plan",
    );
    requireProvider(
        sub.livemode === expected.expectedLivemode,
        "mode-mismatch",
    );
    const customer = providerId(sub.customer);
    requireProvider(
        customer && (!expected.customerId || customer === expected.customerId),
        "customer-mismatch",
    );
    requireProvider(
        !expected.expectedMembershipId ||
            !sub.metadata.membershipId ||
            sub.metadata.membershipId === expected.expectedMembershipId,
        "membership-mismatch",
    );
    const item = sub.items.data[0];
    requireProvider(
        !sub.items.has_more &&
            sub.items.data.length === 1 &&
            item &&
            item.subscription === sub.id &&
            item.quantity === 1 &&
            item.price.livemode === sub.livemode &&
            item.price.recurring?.interval === "month" &&
            item.price.recurring.interval_count === 1 &&
            item.price.recurring.usage_type === "licensed" &&
            !sub.schedule &&
            !sub.pending_update &&
            !sub.pause_collection &&
            !sub.pending_invoice_item_interval &&
            ["active", "past_due", "unpaid", "canceled"].includes(sub.status),
        "unsupported-subscription",
    );
    requireProvider(
        Number.isInteger(sub.current_period_start) &&
            Number.isInteger(sub.current_period_end) &&
            sub.current_period_end > sub.current_period_start,
        "unsupported-subscription",
    );
    return { customer, item };
}

export function validateInvoice(
    invoice: Stripe.Invoice,
    sub: Stripe.Subscription,
    itemId: string,
    priceId: string,
    customer: string,
) {
    requireProvider(
        providerId(invoice.subscription) === sub.id &&
            providerId(invoice.customer) === customer,
        "invoice-mismatch",
    );
    requireProvider(invoice.livemode === sub.livemode, "mode-mismatch");
    const line = invoice.lines.data[0];
    requireProvider(
        !invoice.lines.has_more &&
            invoice.lines.data.length === 1 &&
            line &&
            line.type === "subscription" &&
            !line.proration &&
            providerId(line.subscription) === sub.id &&
            providerId(line.subscription_item) === itemId &&
            line.price?.id === priceId &&
            line.quantity === 1 &&
            ["subscription_create", "subscription_cycle"].includes(
                invoice.billing_reason || "",
            ),
        "complex-invoice",
    );
    requireProvider(
        line.period.start === sub.current_period_start &&
            line.period.end === sub.current_period_end,
        "no-current-invoice",
    );
    requireProvider(
        line.currency === invoice.currency &&
            sub.items.data[0].price.currency === invoice.currency &&
            /^[a-z]{3}$/.test(invoice.currency) &&
            minorAmount(invoice.amount_paid),
        "complex-invoice",
    );
}

export function validateCharge(
    charge: Stripe.Charge,
    invoice: Stripe.Invoice,
    customer: string,
) {
    requireProvider(
        providerId(charge.customer) === customer &&
            providerId(charge.invoice) === invoice.id &&
            providerId(invoice.charge) === charge.id &&
            providerId(charge.payment_intent) ===
                providerId(invoice.payment_intent) &&
            charge.currency === invoice.currency,
        "charge-mismatch",
    );
    requireProvider(charge.livemode === invoice.livemode, "mode-mismatch");
    requireProvider(
        charge.paid &&
            charge.captured &&
            charge.status === "succeeded" &&
            !charge.disputed &&
            !charge.transfer &&
            !charge.transfer_data &&
            !charge.application_fee &&
            !charge.on_behalf_of &&
            minorAmount(charge.amount) &&
            charge.amount === charge.amount_captured &&
            charge.amount === invoice.amount_paid &&
            minorAmount(charge.amount_refunded) &&
            charge.amount_refunded <= charge.amount,
        "complex-charge",
    );
}
