import { Constants, type Membership } from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import type { InternalPaymentPlan } from "@/models/PaymentPlan";
import { MembershipModel, PaymentPlanModel } from "./models";
import { requireCondition } from "@/services/content-changes/errors";
import type { BillingTarget } from "@/models/BillingCancellation";
import { previewRetention } from "@/services/member-access";
import type { BillingConsequenceView } from "./types";

export function requireBillingMember(ctx: GQLContext, mutation = false) {
    requireCondition(
        ctx.user?.active &&
            String(ctx.user.domain) === String(ctx.subdomain._id),
        "unauthorized",
        "Sign in to view your membership.",
        401,
    );
    requireCondition(
        !mutation || !ctx.memberMimic,
        "mimic_read_only",
        "Exit Member Mimic before making changes.",
        403,
    );
}
export async function ownMembership(
    ctx: GQLContext,
    membershipId: string,
): Promise<Membership> {
    requireBillingMember(ctx);
    const membership = await MembershipModel.findOne({
        domain: ctx.subdomain._id,
        userId: ctx.user.userId,
        membershipId,
        isIncludedInPlan: { $ne: true },
    }).lean();
    requireCondition(membership, "not_found", "Membership not found.", 404);
    return membership;
}
export async function membershipPlan(
    ctx: GQLContext,
    member: Membership,
): Promise<InternalPaymentPlan | null> {
    return PaymentPlanModel.findOne({
        domain: ctx.subdomain._id,
        planId: member.paymentPlanId,
        entityId: member.entityId,
        entityType: member.entityType,
    }).lean();
}
export async function membershipTargets(
    ctx: GQLContext,
    member: Membership,
): Promise<BillingTarget[]> {
    const included: Membership[] = await MembershipModel.find({
        domain: ctx.subdomain._id,
        userId: member.userId,
        paymentPlanId: member.paymentPlanId,
        sessionId: member.sessionId,
        isIncludedInPlan: true,
        entityType: Constants.MembershipEntityType.COURSE,
        status: {
            $in: [
                Constants.MembershipStatus.ACTIVE,
                Constants.MembershipStatus.EXPIRED,
            ],
        },
    }).lean();
    return [member, ...included]
        .map((item) => ({
            membershipId: item.membershipId,
            sessionId: item.sessionId,
            entityId: item.entityId,
            entityType: item.entityType,
            ...(item.entityType === Constants.MembershipEntityType.COURSE
                ? {
                      accessKey: {
                          domainId: String(ctx.subdomain._id),
                          userId: member.userId,
                          courseId: item.entityId,
                          membershipId: item.membershipId,
                          membershipSessionId: item.sessionId,
                      },
                  }
                : {}),
        }))
        .sort((a, b) => a.membershipId.localeCompare(b.membershipId));
}
export async function previewConsequences(
    targets: BillingTarget[],
    cutoff = new Date(),
): Promise<BillingConsequenceView> {
    let retainedCount = 0,
        unknownReleaseCount = 0,
        unknownCourseCount = 0;
    for (const target of targets) {
        if (!target.accessKey) continue;
        const result = await previewRetention(target.accessKey, cutoff);
        if (result.kind === "unknown") unknownCourseCount++;
        else {
            retainedCount += result.snapshot.retainedLessonIds.length;
            unknownReleaseCount += result.snapshot.unknownReleaseCount;
        }
    }
    return {
        kind:
            unknownCourseCount || unknownReleaseCount
                ? "partly-unknown"
                : "known",
        retainedCount,
        unknownReleaseCount,
        unknownCourseCount,
        archiveAccess: "ends-on-cancellation",
        futureDrops: "stop-on-cancellation",
        cutoff: null,
    };
}

export function sameBillingTargets(
    left: BillingTarget[],
    right: BillingTarget[],
) {
    const keys = (targets: BillingTarget[]) =>
        targets
            .map((target) => {
                const access = target.accessKey;
                return JSON.stringify([
                    target.membershipId,
                    target.sessionId,
                    target.entityId,
                    target.entityType,
                    access
                        ? [
                              access.domainId,
                              access.userId,
                              access.courseId,
                              access.membershipId,
                              access.membershipSessionId,
                          ]
                        : null,
                ]);
            })
            .sort();
    return JSON.stringify(keys(left)) === JSON.stringify(keys(right));
}
