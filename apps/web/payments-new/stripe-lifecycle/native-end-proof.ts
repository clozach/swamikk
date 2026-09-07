import Cancellation from "@/models/BillingCancellation";
import type { InternalStripeSubscriptionBinding } from "@/models/StripeSubscriptionBinding";
import type { NativeSubscriptionEndProof } from "../../../../packages/common-models/src/stripe-lifecycle";

/** Only a confirmed native operation may explain subsecond precision lost by the provider. */
export async function nativeCancellationProof(
    binding: InternalStripeSubscriptionBinding,
    providerCutoff: Date,
): Promise<NativeSubscriptionEndProof | undefined> {
    const record = await Cancellation.findOne({
        domain: binding.domain,
        userId: binding.userId,
        membershipId: binding.membershipId,
        membershipSessionId: binding.membershipSessionId,
        "quote.subscriptionId": binding.subscriptionId,
        "quote.customerId": binding.customerId,
        "quote.mode": binding.mode,
        "cancellation.kind": "canceled",
    }).lean();
    if (!record || record.cancellation.kind !== "canceled") return;
    const cutoff = new Date(record.cancellation.cutoff);
    const provider = providerCutoff.getTime();
    if (
        !Number.isFinite(cutoff.getTime()) ||
        !Number.isFinite(new Date(record.cancellation.confirmedAt).getTime()) ||
        provider % 1000 !== 0 ||
        Math.floor(cutoff.getTime() / 1000) * 1000 !== provider ||
        new Date(record.cancellation.confirmedAt) < cutoff ||
        new Date(record.consequences.cutoff || "invalid").getTime() !==
            cutoff.getTime()
    )
        return;
    const targets = record.targets
        .filter((target) => {
            const key = target.accessKey;
            return (
                target.entityType === "course" &&
                !!key &&
                key.domainId === String(binding.domain) &&
                key.userId === binding.userId &&
                key.membershipSessionId === binding.membershipSessionId &&
                target.sessionId === binding.membershipSessionId &&
                key.membershipId === target.membershipId &&
                key.courseId === target.entityId &&
                (target.membershipId === binding.membershipId ||
                    (binding.includedMembershipIds || []).includes(
                        target.membershipId,
                    ))
            );
        })
        .map((target) => ({
            membershipId: target.membershipId,
            courseId: target.entityId,
        }));
    return targets.length
        ? { operationId: record.operationId, cutoff, targets }
        : undefined;
}
