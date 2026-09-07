import mongoose from "mongoose";
import Stripe from "stripe";
import captured from "./fixtures/native-retention-preimage.json";
import Domain from "@/models/Domain";
import Binding from "@/models/StripeSubscriptionBinding";
import Cancellation from "@/models/BillingCancellation";
import {
    AccessCourseModel as Course,
    AccessLessonModel as Lesson,
    AccessMembershipModel as Membership,
    AccessUserModel as User,
    MembershipAccessModel as Access,
} from "../../../../../../../packages/common-logic/src/member-access/models";

/** Exact captured native snapshot from before-native.json, isolated in a test tenant. */
export async function precisionFixture(nativeConfirmed = true) {
    const saved = JSON.parse(JSON.stringify(captured), (_key, value) =>
        value?.$date
            ? new Date(value.$date)
            : value?.$oid
              ? new mongoose.Types.ObjectId(value.$oid)
              : value,
    );
    const domain = await Domain.create({
        name: `precision-${new mongoose.Types.ObjectId()}`,
        email: "operator@example.test",
    });
    saved.domain = domain._id;
    const user = await User.create({
        domain: domain._id,
        userId: saved.userId,
        email: "member@example.test",
        active: true,
        purchases: [],
    });
    const admin = await User.create({
        domain: domain._id,
        userId: `admin-${domain._id}`,
        email: "operator@example.test",
        active: true,
        permissions: ["setting:manage"],
    });
    const member = await Membership.create({
        domain: domain._id,
        membershipId: saved.membershipId,
        userId: saved.userId,
        entityId: saved.courseId,
        entityType: "course",
        sessionId: saved.membershipSessionId,
        paymentPlanId: "plan",
        subscriptionId: "sub_precision",
        subscriptionMethod: "stripe",
        status: "expired",
        accessActivation: {
            sessionId: saved.membershipSessionId,
            startedAt: saved.start.at,
        },
    });
    await Access.create(saved);
    await Course.create({
        domain: domain._id,
        courseId: saved.courseId,
        title: "Library edited after cancellation",
        slug: `precision-${domain._id}`,
        creatorId: admin.userId,
        type: "course",
        costType: "free",
        cost: 0,
        privacy: "public",
        published: true,
        groups: [
            {
                _id: "open",
                name: "Open",
                rank: 1,
                drip: { status: false, type: "relative-date" },
                lessonsOrder: [
                    ...saved.state.snapshot.visibleLessonIds,
                    "later-added",
                ],
            },
        ],
    });
    await Lesson.insertMany(
        [...saved.state.snapshot.visibleLessonIds, "later-added"].map(
            (lessonId) => ({
                domain: domain._id,
                courseId: saved.courseId,
                lessonId,
                title: "Practice",
                type: "text",
                creatorId: admin.userId,
                groupId: "open",
                published: true,
                requiresEnrollment: true,
            }),
        ),
    );
    const binding = await Binding.create({
        domain: domain._id,
        subscriptionId: "sub_precision",
        mode: "test",
        membershipId: saved.membershipId,
        membershipSessionId: saved.membershipSessionId,
        userId: saved.userId,
        paymentPlanId: "plan",
        planType: "subscription",
        originalInvoiceId: "original",
        customerId: "cus_precision",
        includedMembershipIds: [],
        state: { kind: "observed", status: "active", cancelAtPeriodEnd: false },
        revision: 0,
    });
    const cutoff = new Date(saved.state.snapshot.cutoff);
    const key = {
        domainId: String(domain._id),
        userId: saved.userId,
        courseId: saved.courseId,
        membershipId: saved.membershipId,
        membershipSessionId: saved.membershipSessionId,
    };
    const cancellation = {
        domain: domain._id,
        userId: saved.userId,
        operationId: saved.state.operationId,
        membershipId: saved.membershipId,
        membershipSessionId: saved.membershipSessionId,
        quote: {
            subscriptionId: "sub_precision",
            customerId: "cus_precision",
            mode: "test",
        },
        expiresAt: new Date(),
        consequences: {
            cutoff: cutoff.toISOString(),
            retainedCount: 1,
            unknownReleaseCount: 0,
            unknownCourseCount: 0,
        },
        targets: [
            {
                membershipId: saved.membershipId,
                sessionId: saved.membershipSessionId,
                entityId: saved.courseId,
                entityType: "course",
                accessKey: key,
            },
        ],
        cancellation: {
            kind: "canceled",
            cutoff,
            confirmedAt: saved.state.endedAt,
        },
        access: "ended",
        refund: { kind: "not-started" },
        revision: 7,
    };
    if (nativeConfirmed) await Cancellation.create(cancellation);
    const subscription = {
        id: "sub_precision",
        customer: "cus_precision",
        livemode: false,
        status: "canceled",
        ended_at: Math.floor(cutoff.getTime() / 1000),
        cancel_at_period_end: false,
    };
    const provider = {
        subscriptions: { retrieve: jest.fn(async () => ({ ...subscription })) },
    } as unknown as Stripe;
    const event = {
        id: `evt-${domain._id}`,
        type: "customer.subscription.updated",
        livemode: false,
        data: { object: { id: "sub_precision" } },
    } as unknown as Stripe.Event;
    return {
        domain,
        user,
        admin,
        member,
        saved,
        binding,
        cutoff,
        key,
        cancellation,
        subscription,
        provider,
        event,
        ctx: {
            subdomain: domain,
            user: admin,
            address: "https://example.test",
        } as any,
    };
}

export async function cleanupPrecision(
    f: Awaited<ReturnType<typeof precisionFixture>>,
) {
    for (const model of [
        Binding,
        Cancellation,
        Access,
        Membership,
        Course,
        Lesson,
        User,
    ])
        await (model as mongoose.Model<any>).deleteMany({
            domain: f.domain._id,
        });
    await Domain.deleteOne({ _id: f.domain._id });
}
