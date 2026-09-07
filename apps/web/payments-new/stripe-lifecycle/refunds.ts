import { randomUUID } from "crypto";
import type Stripe from "stripe";
import Ledger from "@/models/StripeChargeRefunds";
import type { StripeRefundObservation } from "../../../../packages/common-models/src/stripe-refunds";
import {
    allChargeRefunds,
    refundStatus,
    CancellationReview,
} from "../cancellation/validation";
import { proveRefundCharge } from "./refund-proof";
import { providerId, requireStripeFact, StripeLifecycleError } from "./errors";
import { captureNativeRefunds } from "./refund-native";

export const stripeRefundEventTypes = [
    "refund.created",
    "refund.updated",
    "refund.failed",
    "charge.refunded",
];

/** Read provider facts only. This never creates a refund, approves a request or changes membership access. */
export async function reconcileChargeRefunds(
    domainId: string,
    event: Stripe.Event,
    stripe: Stripe,
) {
    const eventObjectId = providerId(event.data.object);
    requireStripeFact(eventObjectId, "refund-event-object-unavailable");
    const trigger =
        event.type === "charge.refunded"
            ? null
            : await stripe.refunds.retrieve(eventObjectId);
    requireStripeFact(
        !trigger || trigger.id === eventObjectId,
        "refund-provider-mismatch",
    );
    const chargeId = trigger ? providerId(trigger.charge) : eventObjectId;
    requireStripeFact(chargeId, "refund-charge-unavailable");
    const charge = await stripe.charges.retrieve(chargeId);
    requireStripeFact(charge.id === chargeId, "refund-provider-mismatch");
    const proof = await proveRefundCharge(
        domainId,
        event.livemode ? "live" : "test",
        stripe,
        charge,
    );
    const key = { domain: domainId, mode: proof.mode, chargeId };
    await Ledger.init();
    try {
        await Ledger.updateOne(
            key,
            {
                $setOnInsert: {
                    ...key,
                    ...proof,
                    state: { kind: "bound" },
                    revision: 0,
                },
            },
            { upsert: true },
        );
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
    }
    const bound = await Ledger.findOne(key).lean();
    requireStripeFact(
        bound &&
            Object.entries(proof).every(
                ([field, value]) => bound[field] === value,
            ),
        "refund-binding-conflict",
    );
    const claimId = randomUUID();
    const claimed = await Ledger.findOneAndUpdate(
        { _id: bound._id, claim: { $exists: false } },
        {
            $set: {
                claim: {
                    id: claimId,
                    eventId: event.id,
                    startedAt: new Date(),
                },
            },
        },
        { new: true },
    ).lean();
    if (!claimed)
        throw new StripeLifecycleError(
            "refund-reconciliation-in-progress",
            true,
        );
    try {
        const nativeBaselines = await captureNativeRefunds(bound);
        const current = await stripe.charges.retrieve(chargeId);
        const fresh = await proveRefundCharge(
            domainId,
            proof.mode,
            stripe,
            current,
        );
        requireStripeFact(
            Object.entries(fresh).every(
                ([field, value]) => bound[field] === value,
            ),
            "refund-binding-conflict",
        );
        const refunds = await allChargeRefunds(stripe, chargeId);
        if (trigger && !refunds.some((refund) => refund.id === trigger.id))
            throw new StripeLifecycleError("refund-history-pending", true);
        const entries: StripeRefundObservation[] = refunds
            .map((refund) => {
                requireStripeFact(
                    providerId(refund.charge) === chargeId &&
                        (!providerId(refund.payment_intent) ||
                            providerId(refund.payment_intent) ===
                                proof.paymentIntentId) &&
                        refund.currency === proof.currency &&
                        Number.isSafeInteger(refund.amount) &&
                        refund.amount > 0 &&
                        refund.amount <= proof.chargedAmount &&
                        Number.isSafeInteger(refund.created) &&
                        refund.created > 0,
                    "refund-history-mismatch",
                );
                return {
                    refundId: refund.id,
                    amount: refund.amount,
                    currency: refund.currency,
                    status: refundStatus(refund.status),
                    createdAt: new Date(refund.created * 1000),
                };
            })
            .sort((a, b) => a.refundId.localeCompare(b.refundId));
        const outstanding = entries
            .filter((item) => !["failed", "canceled"].includes(item.status))
            .reduce((sum, item) => sum + item.amount, 0);
        requireStripeFact(
            new Set(entries.map((item) => item.refundId)).size ===
                entries.length && outstanding <= proof.chargedAmount,
            "refund-history-mismatch",
        );
        const refundedAmount = entries
            .filter((item) => item.status === "succeeded")
            .reduce((sum, item) => sum + item.amount, 0);
        if (
            JSON.stringify(nativeBaselines) !==
            JSON.stringify(await captureNativeRefunds(bound))
        )
            throw new StripeLifecycleError(
                "refund-native-observation-changed",
                true,
            );
        const saved = await Ledger.updateOne(
            { _id: bound._id, "claim.id": claimId },
            {
                $set: {
                    state: {
                        kind: "observed",
                        refunds: entries,
                        refundedAmount,
                        observedAt: new Date(),
                        nativeBaselines,
                    },
                },
                $inc: { revision: 1 },
            },
        );
        if (!saved.matchedCount)
            throw new StripeLifecycleError("refund-claim-unavailable", true);
        return Response.json({
            message: "Refund status recorded; access unchanged",
        });
    } catch (error) {
        if (error instanceof CancellationReview)
            throw new StripeLifecycleError(`refund-${error.reason}`);
        throw error;
    } finally {
        await Ledger.updateOne(
            { _id: bound._id, "claim.id": claimId },
            { $unset: { claim: 1 } },
        );
    }
}
