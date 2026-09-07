import {
    providerId,
    minorAmount,
} from "@/payments-new/cancellation/validation";
import {
    requireRefund,
    type PurchaseRefundClient,
    type PurchaseRefundInput,
} from "./provider-types";

/** A one-time Checkout payment is proved through provider objects, never a browser charge ID. */
export async function provePurchasePayment(
    client: PurchaseRefundClient,
    input: PurchaseRefundInput,
) {
    requireRefund(
        /^cs_/.test(input.checkoutSessionId) &&
            /^[a-z]{3}$/.test(input.currency) &&
            minorAmount(input.paidAmount),
        "unsupported-payment",
    );
    const session = await client.checkout.sessions.retrieve(
        input.checkoutSessionId,
    );
    requireRefund(
        session.id === input.checkoutSessionId &&
            session.mode === "payment" &&
            !session.subscription &&
            session.status === "complete" &&
            session.payment_status === "paid",
        "unsupported-payment",
    );
    requireRefund(
        session.metadata?.invoiceId === input.invoiceId &&
            session.metadata?.membershipId === input.membershipId,
        "payment-mismatch",
    );
    requireRefund(
        session.livemode === (input.mode === "live"),
        "mode-mismatch",
    );
    requireRefund(
        session.amount_total === input.paidAmount &&
            session.currency === input.currency,
        "amount-changed",
    );
    const intentId = providerId(session.payment_intent);
    requireRefund(intentId, "payment-mismatch");
    const intent = await client.paymentIntents.retrieve(intentId);
    requireRefund(
        intent.id === intentId &&
            intent.status === "succeeded" &&
            intent.amount === input.paidAmount &&
            intent.amount_received === input.paidAmount &&
            intent.amount_capturable === 0 &&
            intent.currency === input.currency,
        "payment-mismatch",
    );
    requireRefund(intent.livemode === session.livemode, "mode-mismatch");
    const customerId = providerId(session.customer);
    requireRefund(
        providerId(intent.customer) === customerId,
        "customer-mismatch",
    );
    const chargeId = providerId(intent.latest_charge);
    requireRefund(chargeId, "payment-mismatch");
    const charge = await client.charges.retrieve(chargeId);
    requireRefund(
        charge.id === chargeId &&
            providerId(charge.payment_intent) === intent.id &&
            providerId(charge.customer) === customerId &&
            providerId(charge.invoice) === providerId(intent.invoice) &&
            providerId(intent.invoice) === providerId(session.invoice),
        "payment-mismatch",
    );
    requireRefund(
        charge.livemode === session.livemode &&
            charge.currency === input.currency,
        "mode-mismatch",
    );
    requireRefund(
        charge.paid &&
            charge.captured &&
            charge.status === "succeeded" &&
            !charge.disputed &&
            !charge.transfer &&
            !charge.transfer_data &&
            !charge.application_fee &&
            !charge.on_behalf_of &&
            !intent.transfer_data &&
            !intent.application_fee_amount &&
            !intent.on_behalf_of &&
            charge.amount === input.paidAmount &&
            charge.amount_captured === input.paidAmount &&
            minorAmount(charge.amount_refunded) &&
            charge.amount_refunded <= input.paidAmount,
        "complex-payment",
    );
    return { paymentIntentId: intent.id, customerId, charge };
}
