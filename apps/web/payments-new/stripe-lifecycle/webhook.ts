import type Stripe from "stripe";
import { reconcileChargeRefunds, stripeRefundEventTypes } from "./refunds";
import type StripePayment from "../stripe-payment";
import type { InternalStripeSubscriptionBinding } from "@/models/StripeSubscriptionBinding";
import { receiveStripeEvent, settleStripeEvent } from "./receipts";
import { reconcileSubscription } from "./subscription";
import { StripeLifecycleError, requireStripeFact } from "./errors";

export async function handleStripeEvent(
    domainId: string,
    event: Stripe.Event,
    payment: StripePayment,
    paid: (
        binding?: InternalStripeSubscriptionBinding,
        active?: boolean,
    ) => Promise<Response>,
): Promise<Response> {
    const subscriptionEvent = [
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ].includes(event.type);
    const refundEvent = stripeRefundEventTypes.includes(event.type);
    if (!subscriptionEvent && !refundEvent && !payment.isPaymentEvent(event))
        return Response.json({ message: "Event ignored" });
    const expectedMode = payment.siteinfo.stripeKey?.startsWith("pk_test_")
        ? false
        : payment.siteinfo.stripeKey?.startsWith("pk_live_")
          ? true
          : null;
    requireStripeFact(
        expectedMode !== null && event.livemode === expectedMode,
        "stripe-mode-mismatch",
    );
    const receipt = await receiveStripeEvent(domainId, event);
    if (receipt.state.kind === "complete")
        return Response.json({ message: "Event already reconciled" });
    try {
        const subscriptionId = subscriptionEvent
            ? (event.data.object as Stripe.Subscription).id
            : payment.getSubscriptionId(event);
        const response = refundEvent
            ? await reconcileChargeRefunds(domainId, event, payment.stripe)
            : subscriptionId
              ? await reconcileSubscription(
                    domainId,
                    event,
                    payment.stripe,
                    subscriptionId,
                    subscriptionEvent ? undefined : paid,
                    subscriptionEvent
                        ? undefined
                        : (payment.getMetadata(event).invoiceId as
                              | string
                              | undefined),
                )
              : await paid();
        if (!response.ok)
            throw new StripeLifecycleError(
                "payment-processing-incomplete",
                true,
            );
        await settleStripeEvent(domainId, event, {
            kind: "complete",
            outcome: refundEvent
                ? "refund-reconciled"
                : subscriptionEvent
                  ? "subscription-reconciled"
                  : "payment-reconciled",
        });
        return response;
    } catch (error) {
        const known = error instanceof StripeLifecycleError;
        const reason = known
            ? error.reason
            : "stripe-reconciliation-unavailable";
        const retry = !known || error.retryable;
        await settleStripeEvent(domainId, event, {
            kind: retry ? "retry" : "review-required",
            reason,
        });
        if (!known) throw error;
        return Response.json(
            {
                message: retry
                    ? "Reconciliation pending"
                    : "Reconciliation needs review",
                reason,
            },
            { status: retry ? 503 : 202 },
        );
    }
}
