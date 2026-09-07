import { randomUUID } from "crypto";
import type Stripe from "stripe";
import { Constants } from "@courselit/common-models";
import Binding, {
    type InternalStripeSubscriptionBinding,
} from "@/models/StripeSubscriptionBinding";
import Membership from "@/models/Membership";
import { bindSubscription } from "./binding";
import { providerId, requireStripeFact, StripeLifecycleError } from "./errors";
import { confirmProviderMembershipEnd } from "../../../../packages/common-logic/src/member-access/provider-end";
import { AccountLifecycleError } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import { MembershipAccessModel } from "../../../../packages/common-logic/src/member-access/models";
import { capBoundPeriods } from "./cap";
import { nativeCancellationProof } from "./native-end-proof";

async function announceEnd(
    binding: InternalStripeSubscriptionBinding,
    subscription: Stripe.Subscription,
) {
    if (
        binding.planType !== Constants.PaymentPlanType.SUBSCRIPTION ||
        subscription.status !== "canceled"
    )
        return binding;
    requireStripeFact(
        typeof subscription.ended_at === "number" &&
            subscription.ended_at > 0 &&
            subscription.ended_at * 1000 <= Date.now() + 1000,
        "subscription-ended-time-unavailable",
    );
    const cutoff = new Date(subscription.ended_at * 1000);
    for (let attempt = 0; attempt < 8; attempt++) {
        const current = await Binding.findById(binding._id).lean();
        requireStripeFact(current, "subscription-binding-unavailable");
        const effectiveCutoff =
            current.state.kind !== "observed" &&
            new Date(current.state.cutoff) < cutoff
                ? new Date(current.state.cutoff)
                : cutoff;
        const nativeCancellation = await nativeCancellationProof(
            current,
            effectiveCutoff,
        );
        if (
            current.state.kind !== "observed" &&
            new Date(current.state.cutoff) <= cutoff &&
            (!nativeCancellation ||
                JSON.stringify(current.state.nativeCancellation) ===
                    JSON.stringify(nativeCancellation))
        )
            return current;
        const changed = await Binding.findOneAndUpdate(
            { _id: current._id, revision: current.revision },
            {
                $set: {
                    state:
                        current.state.kind !== "observed" &&
                        new Date(current.state.cutoff) <= cutoff
                            ? {
                                  ...current.state,
                                  nativeCancellation,
                              }
                            : {
                                  kind: "ending",
                                  cutoff: effectiveCutoff,
                                  operationId: `stripe-end:${current.mode}:${current.subscriptionId}`,
                                  ...(nativeCancellation
                                      ? { nativeCancellation }
                                      : {}),
                              },
                },
                $inc: { revision: 1 },
            },
            { new: true },
        ).lean();
        if (changed) return changed;
    }
    throw new StripeLifecycleError("subscription-changed-concurrently", true);
}

async function finishEnd(
    binding: InternalStripeSubscriptionBinding,
    attempt = 0,
): Promise<void> {
    if (binding.state.kind === "observed") return;
    const { cutoff, operationId } = binding.state;
    const targets = (
        await Membership.find({
            domain: binding.domain,
            userId: binding.userId,
            sessionId: binding.membershipSessionId,
            $or: [
                { membershipId: binding.membershipId },
                {
                    isIncludedInPlan: true,
                    paymentPlanId: binding.paymentPlanId,
                },
            ],
        }).lean()
    ).map((member: any) => ({
        membershipId: String(member.membershipId),
        entityId: String(member.entityId),
        entityType: String(member.entityType),
    }));
    // The mutable native membership may already represent a rejoin; its old period remains exact evidence.
    const historical = await MembershipAccessModel.find({
        domain: binding.domain,
        userId: binding.userId,
        membershipId: {
            $in: [
                binding.membershipId,
                ...(binding.includedMembershipIds || []),
            ],
        },
        membershipSessionId: binding.membershipSessionId,
    }).lean();
    for (const period of historical)
        if (
            !targets.some(
                (target: any) => target.membershipId === period.membershipId,
            )
        )
            targets.push({
                membershipId: period.membershipId,
                entityId: period.courseId,
                entityType: Constants.MembershipEntityType.COURSE,
            });
    let unknownReleaseCount = 0;
    for (const target of targets) {
        if (target.entityType === Constants.MembershipEntityType.COURSE) {
            try {
                const result = await confirmProviderMembershipEnd({
                    domainId: String(binding.domain),
                    userId: binding.userId,
                    courseId: target.entityId,
                    membershipId: target.membershipId,
                    membershipSessionId: binding.membershipSessionId,
                    operationId,
                    cutoff: new Date(cutoff),
                    nativeCancellation: binding.state.nativeCancellation,
                });
                unknownReleaseCount += result.snapshot.unknownReleaseCount;
            } catch (error) {
                // Financial correlation remains after erasure. Never recreate personal access.
                if (!(error instanceof AccountLifecycleError)) throw error;
            }
        }
        await Membership.updateOne(
            {
                domain: binding.domain,
                userId: binding.userId,
                membershipId: target.membershipId,
                sessionId: binding.membershipSessionId,
                status: {
                    $in: [
                        Constants.MembershipStatus.ACTIVE,
                        Constants.MembershipStatus.PENDING,
                    ],
                },
            },
            { $set: { status: Constants.MembershipStatus.EXPIRED } },
        );
    }
    const latest = await Binding.findById(binding._id).lean();
    requireStripeFact(latest, "subscription-binding-unavailable");
    if (latest.revision !== binding.revision) {
        if (attempt >= 8)
            throw new StripeLifecycleError(
                "subscription-changed-concurrently",
                true,
            );
        return finishEnd(latest, attempt + 1);
    }
    if (
        binding.state.kind === "ended" &&
        binding.state.unknownReleaseCount === unknownReleaseCount
    )
        return;
    const settled = await Binding.updateOne(
        {
            _id: binding._id,
            revision: binding.revision,
            "state.kind": { $in: ["ending", "ended"] },
            "state.cutoff": cutoff,
            $or: [
                { "state.kind": "ending" },
                { "state.unknownReleaseCount": { $ne: unknownReleaseCount } },
            ],
        },
        {
            $set: {
                state: {
                    kind: "ended",
                    cutoff,
                    operationId,
                    unknownReleaseCount,
                    ...(binding.state.nativeCancellation
                        ? {
                              nativeCancellation:
                                  binding.state.nativeCancellation,
                          }
                        : {}),
                },
            },
            $inc: { revision: 1 },
        },
    );
    if (!settled.modifiedCount) {
        const current = await Binding.findById(binding._id).lean();
        requireStripeFact(current, "subscription-binding-unavailable");
        if (attempt >= 8)
            throw new StripeLifecycleError(
                "subscription-changed-concurrently",
                true,
            );
        return finishEnd(current, attempt + 1);
    }
}

/** Terminal evidence is written before claiming so a stuck writer cannot keep reads/drip open. */
export async function reconcileSubscription(
    domainId: string,
    event: Stripe.Event,
    stripe: Stripe,
    subscriptionId: string,
    paid?: (
        binding: InternalStripeSubscriptionBinding,
        active: boolean,
    ) => Promise<Response>,
    orderId?: string,
): Promise<Response> {
    const mode = event.livemode ? "live" : "test";
    let subscription = await stripe.subscriptions.retrieve(subscriptionId);
    requireStripeFact(
        subscription.id === subscriptionId,
        "subscription-provider-mismatch",
    );
    let binding: InternalStripeSubscriptionBinding = await bindSubscription(
        domainId,
        subscription,
        mode,
        orderId,
    );
    binding = await announceEnd(binding, subscription);
    await capBoundPeriods(binding);
    const claimId = randomUUID();
    const claimed = await Binding.findOneAndUpdate(
        { _id: binding._id, claim: { $exists: false } },
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
            "subscription-reconciliation-in-progress",
            true,
        );
    try {
        // Retrieve inside the claim. Event delivery timestamps are not an ordering mechanism.
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
        requireStripeFact(
            subscription.id === subscriptionId &&
                subscription.livemode === event.livemode &&
                providerId(subscription.customer) === binding.customerId,
            "subscription-provider-mismatch",
        );
        binding = await announceEnd(binding, subscription);
        await capBoundPeriods(binding);
        let result: Response | undefined;
        let paymentFailure: unknown;
        if (paid) {
            try {
                result = await paid(
                    binding,
                    binding.planType !==
                        Constants.PaymentPlanType.SUBSCRIPTION ||
                        (binding.state.kind === "observed" &&
                            subscription.status === "active"),
                );
            } catch (error) {
                paymentFailure = error;
            }
        }
        // An end can arrive while activation already holds this claim. Its durable cap wins.
        const latest = await stripe.subscriptions.retrieve(subscriptionId);
        requireStripeFact(
            latest.id === subscriptionId &&
                latest.livemode === event.livemode &&
                providerId(latest.customer) === binding.customerId,
            "subscription-provider-mismatch",
        );
        binding = await announceEnd(binding, latest);
        if (binding.state.kind !== "observed") await finishEnd(binding);
        else
            await Binding.updateOne(
                { _id: binding._id, "state.kind": "observed" },
                {
                    $set: {
                        state: {
                            kind: "observed",
                            status: latest.status,
                            cancelAtPeriodEnd: latest.cancel_at_period_end,
                        },
                    },
                    $inc: { revision: 1 },
                },
            );
        if (paymentFailure) throw paymentFailure;
        return result || Response.json({ message: "Subscription reconciled" });
    } finally {
        await Binding.updateOne(
            { _id: binding._id, "claim.id": claimId },
            { $unset: { claim: 1 } },
        );
    }
}

export async function hasConfirmedSubscriptionEnd(
    domainId: string,
    membershipId: string,
    sessionId: string,
    subscriptionId: string,
) {
    return !!(await Binding.exists({
        domain: domainId,
        membershipId,
        membershipSessionId: sessionId,
        subscriptionId,
        "state.kind": "ended",
    }));
}
