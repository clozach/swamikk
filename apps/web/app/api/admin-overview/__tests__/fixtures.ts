import { randomUUID } from "crypto";
import Domain from "@/models/Domain";
import User from "@/models/User";
import Course from "@/models/Course";
import Invoice from "@/models/Invoice";
import Membership from "@/models/Membership";
import Refunds from "@/models/StripeChargeRefunds";

export async function fixture() {
    const id = randomUUID();
    const now = new Date();
    const domain = await Domain.create({
        name: `overview-${id}`,
        email: `owner-${id}@example.com`,
    });
    const admin = await User.create({
        domain: domain._id,
        userId: `admin-${id}`,
        email: domain.email,
        active: true,
        permissions: ["setting:manage", "user:manage", "course:manage_any"],
    });
    const user = await User.create({
        domain: domain._id,
        userId: `user-${id}`,
        email: `private-${id}@example.com`,
        name: "Private member name",
        active: true,
        permissions: [],
        purchases: [],
    });
    const course = await Course.create({
        domain: domain._id,
        courseId: `course-${id}`,
        title: "Library",
        slug: `library-${id}`,
        creatorId: admin.userId,
        type: "course",
        privacy: "unlisted",
        costType: "free",
        cost: 0,
        published: true,
        groups: [],
    });
    const member = await Membership.create({
        domain: domain._id,
        membershipId: `member-${id}`,
        userId: user.userId,
        entityId: course.courseId,
        entityType: "course",
        status: "pending",
        paymentPlanId: `plan-${id}`,
        sessionId: `session-${id}`,
    });
    const ctx = {
        subdomain: domain,
        user: admin,
        address: "https://example.com",
    } as any;
    return { id, now, domain, admin, user, course, member, ctx };
}
export type Fixture = Awaited<ReturnType<typeof fixture>>;
export async function invoice(f: Fixture, extra: Record<string, unknown> = {}) {
    return Invoice.create({
        domain: f.domain._id,
        invoiceId: randomUUID(),
        membershipId: f.member.membershipId,
        membershipSessionId: f.member.sessionId,
        amount: 9,
        status: "paid",
        paymentProcessor: "stripe",
        paymentMode: "test",
        currencyISOCode: "nzd",
        settlement: {
            at: new Date(f.now.getTime() - 120_000),
            source: "stripe-checkout-confirmed",
        },
        ...extra,
    });
}
export async function refund(
    f: Fixture,
    invoiceId: string,
    extra: Record<string, unknown> = {},
) {
    return Refunds.create({
        domain: f.domain._id,
        chargeId: `ch_${randomUUID()}`,
        paymentIntentId: "pi_private",
        customerId: "cus_private",
        invoiceId,
        nativeTransactionId: "cs_private",
        membershipId: f.member.membershipId,
        membershipSessionId: f.member.sessionId,
        userId: f.user.userId,
        mode: "test",
        currency: "nzd",
        chargedAmount: 900,
        revision: 0,
        state: {
            kind: "observed",
            observedAt: new Date(f.now.getTime() - 60_000),
            refundedAmount: 100,
            nativeBaselines: [],
            refunds: [
                {
                    refundId: "re_private",
                    amount: 100,
                    currency: "nzd",
                    status: "succeeded",
                    createdAt: new Date(f.now.getTime() - 120_000),
                },
            ],
        },
        ...extra,
    });
}
