import type Stripe from "stripe";
import Receipt from "@/models/StripeWebhookReceipt";
import { providerId, requireStripeFact } from "./errors";
import type { StripeWebhookReceipt } from "../../../../packages/common-models/src/stripe-lifecycle";

export async function receiveStripeEvent(
    domainId: string,
    event: Stripe.Event,
) {
    const objectId = providerId(event.data.object);
    requireStripeFact(
        event.id && objectId && typeof event.livemode === "boolean",
        "invalid-stripe-event",
    );
    const key = {
        domain: domainId,
        eventId: event.id,
        mode: event.livemode ? "live" : "test",
    };
    await Receipt.init();
    try {
        await Receipt.updateOne(
            key,
            {
                $setOnInsert: {
                    ...key,
                    type: event.type,
                    objectId,
                    state: { kind: "received" },
                },
            },
            { upsert: true },
        );
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
    }
    const receipt = await Receipt.findOne(key).lean();
    requireStripeFact(
        receipt && receipt.type === event.type && receipt.objectId === objectId,
        "stripe-event-conflict",
    );
    return receipt;
}
export async function settleStripeEvent(
    domainId: string,
    event: Stripe.Event,
    state: StripeWebhookReceipt["state"],
) {
    await Receipt.updateOne(
        {
            domain: domainId,
            eventId: event.id,
            mode: event.livemode ? "live" : "test",
            "state.kind": { $ne: "complete" },
        },
        { $set: { state } },
    );
}
