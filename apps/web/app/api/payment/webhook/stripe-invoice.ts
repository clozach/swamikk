import { createHash } from "crypto";
import type Stripe from "stripe";
import type mongoose from "mongoose";
import type { Membership } from "@courselit/common-models";
import { Constants } from "@courselit/common-models";
import InvoiceModel from "@models/Invoice";
import { fromStripeAmount } from "@/payments-new/stripe-currency";

function settlementEvidence(event: Stripe.Event) {
    const initial = event.type === "checkout.session.completed";
    const seconds = initial
        ? event.created
        : (event.data.object as Stripe.Invoice).status_transitions?.paid_at;
    if (!Number.isSafeInteger(seconds) || !seconds || seconds < 0) return {};
    const at = new Date(seconds * 1000);
    if (!Number.isFinite(at.getTime())) return {};
    return {
        settlement: {
            at,
            source: initial
                ? ("stripe-checkout-confirmed" as const)
                : ("stripe-invoice-paid" as const),
        },
    };
}

/** One invoice per settled provider object, including concurrent deliveries. */
export async function recordStripeInvoice(
    event: Stripe.Event,
    domain: mongoose.Types.ObjectId,
    originalInvoiceId: string,
    membership: Membership,
) {
    const object = event.data.object as any;
    const initial = event.type === "checkout.session.completed";
    if (!initial && event.type !== "invoice.paid")
        throw new Error("Unsupported payment event");
    if (typeof object.id !== "string" || !object.id)
        throw new Error("Missing payment identifier");
    if (typeof event.livemode !== "boolean")
        throw new Error("Missing payment mode");
    const amount = fromStripeAmount(
        initial ? object.amount_total : object.amount_paid,
        object.currency,
    );
    const original = await InvoiceModel.findOne({
        domain,
        invoiceId: originalInvoiceId,
    });
    // An event from a prior checkout cannot revive a later membership session.
    if (
        !original ||
        original.membershipId !== membership.membershipId ||
        original.membershipSessionId !== membership.sessionId ||
        original.paymentProcessor !== "stripe" ||
        original.currencyISOCode.toLowerCase() !== object.currency.toLowerCase()
    ) {
        throw new Error("Payment does not match the current order");
    }
    const paid = {
        amount,
        currencyISOCode: object.currency.toUpperCase(),
        status: Constants.InvoiceStatus.PAID,
        paymentProcessorTransactionId: object.id,
        paymentMode: event.livemode ? "live" : "test",
        ...settlementEvidence(event),
    };
    if (initial) {
        const updated = await InvoiceModel.findOneAndUpdate(
            {
                domain,
                invoiceId: originalInvoiceId,
                membershipSessionId: membership.sessionId,
                status: Constants.InvoiceStatus.PENDING,
            },
            { $set: paid },
            { new: true },
        );
        if (updated) return updated;
        const settled = await InvoiceModel.findOne({
            domain,
            invoiceId: originalInvoiceId,
        });
        if (settled?.paymentProcessorTransactionId !== object.id)
            throw new Error("Order already settled by another payment");
        // Refunded/otherwise settled orders stay in that state on retries.
        return settled;
    }
    const invoiceId = `stripe-${createHash("sha256").update(`${domain}:invoice:${object.id}`).digest("hex")}`;
    const historical = await InvoiceModel.findOne({
        domain,
        paymentProcessor: "stripe",
        paymentProcessorTransactionId: object.id,
        membershipId: membership.membershipId,
        membershipSessionId: membership.sessionId,
    });
    if (historical) return historical;
    await InvoiceModel.init();
    try {
        return await InvoiceModel.findOneAndUpdate(
            { domain, invoiceId },
            {
                $setOnInsert: {
                    domain,
                    invoiceId,
                    membershipId: membership.membershipId,
                    membershipSessionId: membership.sessionId,
                    paymentProcessor: "stripe",
                    ...paid,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
    } catch (failure) {
        if ((failure as { code?: number }).code !== 11000) throw failure;
        const winner = await InvoiceModel.findOne({ domain, invoiceId });
        if (!winner) throw failure;
        return winner;
    }
}
