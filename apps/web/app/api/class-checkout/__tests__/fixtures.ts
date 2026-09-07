import { classFingerprint } from "@/services/class-checkout/choices";
import { randomUUID } from "crypto";
import Domain from "@/models/Domain";
import User from "@/models/User";
import Course from "@/models/Course";
import Cohort from "@/models/Cohort";
import Membership from "@/models/Membership";
import Plan from "@/models/PaymentPlan";
import type GQLContext from "@/models/GQLContext";
import constants from "@/config/constants";

export async function fixture() {
    const id = randomUUID();
    const domain = await Domain.create({
        name: `class-${id}`,
        email: `owner-${id}@example.com`,
    });
    const user = await User.create({
        domain: domain._id,
        userId: `user-${id}`,
        email: `member-${id}@example.com`,
        active: true,
        permissions: [constants.permissions.manageUsers],
        unsubscribeToken: id,
        purchases: [],
    });
    const course = await Course.create({
        domain: domain._id,
        courseId: `course-${id}`,
        title: "A dated class",
        slug: `class-${id}`,
        type: "course",
        cost: 10,
        costType: "paid",
        privacy: "public",
        published: true,
        creatorId: user.userId,
    });
    const plan = await Plan.create({
        domain: domain._id,
        planId: `plan-${id}`,
        userId: user.userId,
        entityId: course.courseId,
        entityType: "course",
        name: "One class",
        type: "onetime",
        oneTimeAmount: 10,
        archived: false,
    });
    const member = await Membership.create({
        domain: domain._id,
        membershipId: `membership-${id}`,
        userId: user.userId,
        entityId: course.courseId,
        entityType: "course",
        paymentPlanId: plan.planId,
        sessionId: `old-${id}`,
        status: "expired",
    });
    const cohort = await Cohort.create({
        domain: domain._id,
        cohortId: `cohort-${id}`,
        name: "First date",
        courseId: course.courseId,
        schedule: { startAt: new Date(Date.now() + 30 * 86400000) },
    });
    // Native field injection makes the pre-implementation sync defect observable.
    await Cohort.collection.updateOne(
        { _id: cohort._id },
        { $set: { checkoutState: "listed-open", checkoutRevision: 0 } },
    );
    const ctx = {
        subdomain: domain,
        user,
        address: "http://localhost",
    } as unknown as GQLContext;
    const fingerprint = classFingerprint(
        (await Cohort.findById(cohort._id).lean())!,
    );
    return { domain, user, course, plan, member, cohort, ctx, fingerprint };
}
