import {
    Community,
    Domain,
    Constants,
    Membership,
    PaymentPlan,
} from "@courselit/common-models";
import CommunityModel from "@models/Community";
import MembershipModel from "@models/Membership";
import mongoose from "mongoose";
import { withAccountWrite } from "../../../../../packages/common-logic/src/account-lifecycle/gate";

export async function activateMembership(
    domain: Domain & { _id: mongoose.Types.ObjectId },
    membership: Membership,
    paymentPlan: PaymentPlan | null,
) {
    return withAccountWrite(
        {
            domainId: String(domain._id),
            userId: membership.userId,
            purpose: "payment-activation",
        },
        () => applyMembershipActivation(domain, membership, paymentPlan),
    );
}

async function applyMembershipActivation(
    domain: Domain & { _id: mongoose.Types.ObjectId },
    membership: Membership,
    paymentPlan: PaymentPlan | null,
) {
    const key = {
        domain: domain._id,
        membershipId: membership.membershipId,
        sessionId: membership.sessionId,
    };
    const current = await MembershipModel.findOne(key);
    if (!current) throw new Error("The membership session has changed.");
    const recoveryOnly = current.status === Constants.MembershipStatus.ACTIVE;
    let activated = current;

    if (!recoveryOnly) {
        if (current.status !== Constants.MembershipStatus.PENDING) {
            throw new Error(
                "Start a new checkout before activating this membership.",
            );
        }
        const update: Record<string, unknown> = {
            status: Constants.MembershipStatus.ACTIVE,
            accessActivation: {
                sessionId: current.sessionId,
                startedAt: new Date(),
            },
        };
        if (current.entityType === Constants.MembershipEntityType.COMMUNITY) {
            if (paymentPlan?.type === Constants.PaymentPlanType.FREE) {
                const community = await CommunityModel.findOne<Community>({
                    communityId: membership.entityId,
                    domain: domain._id,
                });
                if (community) {
                    update.status = community.autoAcceptMembers
                        ? Constants.MembershipStatus.ACTIVE
                        : Constants.MembershipStatus.PENDING;
                    update.role = community.autoAcceptMembers
                        ? Constants.MembershipRole.POST
                        : Constants.MembershipRole.COMMENT;
                    update.joiningReason = community.autoAcceptMembers
                        ? `Auto accepted`
                        : membership.joiningReason;
                } else {
                    throw new Error("The community is unavailable.");
                }
            } else {
                update.role = Constants.MembershipRole.POST;
            }
        }
        if (update.status !== Constants.MembershipStatus.ACTIVE)
            delete update.accessActivation;
        activated = await MembershipModel.findOneAndUpdate(
            { ...key, status: Constants.MembershipStatus.PENDING },
            { $set: update },
            { new: true },
        );
        if (!activated) {
            // Another delivery may have activated this exact session. Recover its
            // follow-up work, but never overwrite cancellation or a newer checkout.
            const winner = await MembershipModel.findOne({
                ...key,
                status: Constants.MembershipStatus.ACTIVE,
            });
            if (!winner)
                throw new Error("The membership changed during activation.");
            return applyMembershipActivation(domain, winner, paymentPlan);
        }
    }
    Object.assign(membership, {
        status: activated.status,
        role: activated.role,
        accessActivation: activated.accessActivation,
    });
    if (activated.status !== Constants.MembershipStatus.ACTIVE) return;

    if (
        activated.entityType === Constants.MembershipEntityType.COMMUNITY &&
        paymentPlan &&
        paymentPlan.includedProducts &&
        paymentPlan.includedProducts.length > 0
    ) {
        const { addIncludedProductsMemberships } = await import(
            "@/graphql/paymentplans/logic"
        );
        await addIncludedProductsMemberships({
            domain: domain._id,
            userId: activated.userId,
            paymentPlan,
            sessionId: activated.sessionId,
            startedAt:
                activated.accessActivation?.sessionId === activated.sessionId
                    ? activated.accessActivation.startedAt
                    : undefined,
        });
    }

    if (paymentPlan) {
        const { runPostMembershipTasks } = await import(
            "@/graphql/users/logic"
        );
        await runPostMembershipTasks({
            domain: domain._id,
            membership: activated,
            paymentPlan,
            recoveryOnly,
        });
    }
}
