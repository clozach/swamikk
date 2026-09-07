import type Stripe from "stripe";
import {
    InvoiceModel,
    MembershipModel,
} from "@/services/member-billing/models";
import { toStripeAmount } from "../stripe-currency";
import { providerId } from "../cancellation/validation";
import { requireStripeFact, StripeLifecycleError } from "./errors";

/** Provider links lead to a native paid transaction; metadata alone never assigns money to an account. */
export async function proveRefundCharge(
    domainId: string,
    mode: "test" | "live",
    stripe: Stripe,
    charge: Stripe.Charge,
) {
    const live = mode === "live";
    const intentId = providerId(charge.payment_intent);
    requireStripeFact(charge.livemode === live, "refund-mode-mismatch");
    requireStripeFact(
        intentId &&
            charge.paid &&
            charge.captured &&
            charge.status === "succeeded" &&
            !charge.disputed &&
            !charge.transfer &&
            !charge.transfer_data &&
            !charge.application_fee &&
            !charge.on_behalf_of &&
            Number.isSafeInteger(charge.amount) &&
            charge.amount > 0 &&
            charge.amount === charge.amount_captured &&
            Number.isSafeInteger(charge.amount_refunded) &&
            charge.amount_refunded >= 0 &&
            charge.amount_refunded <= charge.amount,
        "refund-complex-charge",
    );
    const intent = await stripe.paymentIntents.retrieve(intentId);
    const customerId = providerId(charge.customer);
    const providerInvoiceId = providerId(charge.invoice);
    requireStripeFact(
        intent.id === intentId &&
            intent.livemode === live &&
            intent.status === "succeeded" &&
            providerId(intent.latest_charge) === charge.id &&
            providerId(intent.customer) === customerId &&
            providerId(intent.invoice) === providerInvoiceId &&
            intent.currency === charge.currency &&
            intent.amount_received === charge.amount &&
            !intent.transfer_data &&
            !intent.application_fee_amount &&
            !intent.on_behalf_of,
        "refund-payment-mismatch",
    );
    const providerInvoice = providerInvoiceId
        ? await stripe.invoices.retrieve(providerInvoiceId)
        : null;
    if (providerInvoice)
        requireStripeFact(
            providerInvoice.id === providerInvoiceId &&
                providerInvoice.livemode === live &&
                providerId(providerInvoice.charge) === charge.id &&
                providerId(providerInvoice.payment_intent) === intentId &&
                providerId(providerInvoice.customer) === customerId &&
                providerInvoice.currency === charge.currency &&
                providerInvoice.amount_paid === charge.amount &&
                providerInvoice.paid,
            "refund-invoice-mismatch",
        );
    const direct = providerInvoiceId
        ? await InvoiceModel.find({
              domain: domainId,
              paymentProcessor: "stripe",
              paymentProcessorTransactionId: providerInvoiceId,
          })
              .limit(2)
              .lean()
        : [];
    requireStripeFact(direct.length <= 1, "refund-native-invoice-ambiguous");
    let invoice = direct[0];
    // A refund event can overtake the paid renewal event. Defer a proved native
    // subscription's missing receipt instead of treating delivery order as evidence.
    if (!invoice && providerInvoice?.billing_reason === "subscription_cycle") {
        const subscriptionId = providerId(providerInvoice.subscription);
        const subscription = subscriptionId
            ? await stripe.subscriptions.retrieve(subscriptionId)
            : null;
        requireStripeFact(
            subscription &&
                subscription.id === subscriptionId &&
                subscription.livemode === live &&
                providerId(subscription.customer) === customerId,
            "refund-subscription-mismatch",
        );
        const order = await InvoiceModel.exists({
            domain: domainId,
            invoiceId: subscription.metadata?.invoiceId,
            membershipId: subscription.metadata?.membershipId,
            paymentProcessor: "stripe",
        });
        requireStripeFact(order, "refund-native-invoice-unavailable");
        throw new StripeLifecycleError("refund-payment-not-yet-recorded", true);
    }
    if (!invoice) {
        const subscriptionId = providerId(providerInvoice?.subscription);
        const sessions = await stripe.checkout.sessions.list({
            ...(subscriptionId
                ? { subscription: subscriptionId }
                : { payment_intent: intentId }),
            limit: 2,
        });
        requireStripeFact(
            !sessions.has_more && sessions.data.length === 1,
            "refund-checkout-unavailable",
        );
        const session = sessions.data[0];
        requireStripeFact(
            session.livemode === live &&
                session.status === "complete" &&
                session.payment_status === "paid" &&
                providerId(session.customer) === customerId &&
                session.currency === charge.currency &&
                session.amount_total === charge.amount &&
                providerId(session.invoice) === providerInvoiceId &&
                (subscriptionId
                    ? session.mode === "subscription" &&
                      providerId(session.subscription) === subscriptionId
                    : session.mode === "payment" &&
                      providerId(session.payment_intent) === intentId),
            "refund-checkout-mismatch",
        );
        const orders = await InvoiceModel.find({
            domain: domainId,
            paymentProcessor: "stripe",
            invoiceId: session.metadata?.invoiceId,
            membershipId: session.metadata?.membershipId,
        })
            .limit(2)
            .lean();
        requireStripeFact(
            orders.length === 1,
            "refund-native-invoice-unavailable",
        );
        invoice = orders[0];
        if (invoice.status === "pending")
            throw new StripeLifecycleError(
                "refund-payment-not-yet-settled",
                true,
            );
        requireStripeFact(
            invoice.paymentProcessorTransactionId === session.id,
            "refund-checkout-order-mismatch",
        );
        requireStripeFact(
            session.metadata?.invoiceId === invoice.invoiceId &&
                session.metadata?.membershipId === invoice.membershipId,
            "refund-checkout-order-mismatch",
        );
    }
    if (invoice.status === "pending")
        throw new StripeLifecycleError("refund-payment-not-yet-settled", true);
    requireStripeFact(
        invoice.status === "paid" &&
            (!invoice.paymentMode || invoice.paymentMode === mode) &&
            invoice.currencyISOCode.toLowerCase() === charge.currency &&
            toStripeAmount(invoice.amount, charge.currency) === charge.amount &&
            invoice.paymentProcessorTransactionId,
        "refund-native-payment-mismatch",
    );
    // Financial membership identity survives closure and rejoin; current session equality would lose historical receipts.
    const member = await MembershipModel.findOne({
        domain: domainId,
        membershipId: invoice.membershipId,
    }).lean();
    requireStripeFact(member, "refund-membership-unavailable");
    return {
        mode,
        chargeId: charge.id,
        paymentIntentId: intentId,
        customerId,
        providerInvoiceId,
        invoiceId: invoice.invoiceId,
        nativeTransactionId: invoice.paymentProcessorTransactionId,
        membershipId: invoice.membershipId,
        membershipSessionId: invoice.membershipSessionId,
        userId: member.userId,
        currency: charge.currency,
        chargedAmount: charge.amount,
    };
}
