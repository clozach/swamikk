import mongoose from "mongoose";
import {
    StripeSubscriptionBindingSchema,
    type InternalStripeSubscriptionBinding,
} from "../../../orm-models/src/models/stripe-lifecycle";
import type { SubscriptionAccessSubject } from "../../../common-models/src/stripe-lifecycle";

const Binding =
    (mongoose.models.StripeSubscriptionBinding as
        | mongoose.Model<InternalStripeSubscriptionBinding>
        | undefined) ||
    mongoose.model<InternalStripeSubscriptionBinding>(
        "StripeSubscriptionBinding",
        StripeSubscriptionBindingSchema,
    );

/** A terminal provider fact caps late activation and included products before reconciliation finishes. */
export async function subscriptionEndCutoff(
    subject: SubscriptionAccessSubject,
): Promise<Date | null> {
    const alternatives: Record<string, unknown>[] = [
        { membershipId: subject.membershipId },
        { includedMembershipIds: subject.membershipId },
    ];
    if (subject.isIncludedInPlan && subject.paymentPlanId)
        alternatives.push({ paymentPlanId: subject.paymentPlanId });
    const binding = await Binding.findOne({
        domain: subject.domainId,
        userId: subject.userId,
        membershipSessionId: subject.sessionId,
        "state.kind": { $in: ["ending", "ended"] },
        $or: alternatives,
    })
        .sort({ "state.cutoff": 1 })
        .lean();
    return binding && binding.state.kind !== "observed"
        ? new Date(binding.state.cutoff)
        : null;
}

/** Record provenance before the native included row can appear, including future plan additions. */
export async function rememberIncludedSubscriptionTarget(
    subject: SubscriptionAccessSubject,
): Promise<boolean> {
    const binding = await Binding.findOneAndUpdate(
        {
            domain: subject.domainId,
            userId: subject.userId,
            membershipSessionId: subject.sessionId,
            paymentPlanId: subject.paymentPlanId,
        },
        { $addToSet: { includedMembershipIds: subject.membershipId } },
        { new: true },
    ).lean();
    return !binding || binding.state.kind === "observed";
}
