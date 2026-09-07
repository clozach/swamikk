import type { InternalStripeSubscriptionBinding } from "@/models/StripeSubscriptionBinding";
import Membership from "@/models/Membership";
import { MembershipAccessModel } from "../../../../packages/common-logic/src/member-access/models";
import { StripeLifecycleError } from "./errors";

/** Same-document fence as drip grant/delivery CAS, even when an activation claim is still occupied. */
export async function capBoundPeriods(
    binding: InternalStripeSubscriptionBinding,
    attempt = 0,
): Promise<void> {
    if (binding.state.kind === "observed") return;
    const currentChildren = await Membership.find({
        domain: binding.domain,
        userId: binding.userId,
        sessionId: binding.membershipSessionId,
        paymentPlanId: binding.paymentPlanId,
        isIncludedInPlan: true,
    })
        .select("membershipId")
        .lean();
    const ids = [
        binding.membershipId,
        ...(binding.includedMembershipIds || []),
        ...currentChildren.map((member: any) => member.membershipId),
    ];
    const periods = await MembershipAccessModel.find({
        domain: binding.domain,
        userId: binding.userId,
        membershipSessionId: binding.membershipSessionId,
        membershipId: { $in: ids },
    }).lean();
    for (const period of periods) {
        const state = period.state;
        const previousCutoff =
            state.kind === "active"
                ? null
                : new Date(
                      state.kind === "freezing"
                          ? state.cutoff
                          : state.snapshot.cutoff,
                  );
        const cutoff = new Date(binding.state.cutoff);
        if (previousCutoff && previousCutoff <= cutoff) continue;
        await MembershipAccessModel.updateOne(
            { _id: period._id, revision: period.revision },
            {
                $set: {
                    state: {
                        kind: "freezing",
                        cutoff,
                        operationId:
                            state.kind === "active"
                                ? binding.state.operationId
                                : state.operationId,
                        requestedAt: new Date(),
                    },
                    updatedAt: new Date(),
                },
                $inc: { revision: 1 },
            },
        );
        // If a queued claim won, reread/freeze it before acknowledging the provider cap.
        const current = await MembershipAccessModel.findById(period._id).lean();
        if (
            current &&
            (current.state.kind === "active" ||
                new Date(
                    current.state.kind === "freezing"
                        ? current.state.cutoff
                        : current.state.snapshot.cutoff,
                ) > cutoff)
        ) {
            if (attempt >= 8)
                throw new StripeLifecycleError(
                    "subscription-access-cap-busy",
                    true,
                );
            return capBoundPeriods(binding, attempt + 1);
        }
    }
}
