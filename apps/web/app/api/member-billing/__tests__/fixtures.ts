import { randomUUID } from "crypto";
import { Constants } from "@courselit/common-models";
import Domain from "@/models/Domain";
import User from "@/models/User";
import Course from "@/models/Course";
import Lesson from "@/models/Lesson";
import Membership from "@/models/Membership";
import PaymentPlan from "@/models/PaymentPlan";
import Invoice from "@/models/Invoice";
import BillingCancellation from "@/models/BillingCancellation";
import { MembershipAccessModel } from "../../../../../../packages/common-logic/src/member-access/models";
import { ensureMembershipAccess } from "@/services/member-access";
import type { BillingDependencies } from "@/services/member-billing/provider";
import type { StripeCancellationClient } from "@/payments-new/cancellation";

export async function fixture() {
    const suffix = randomUUID(),
        now = new Date(),
        day = 86400000;
    const domain = await Domain.create({
        name: `billing-${suffix}`,
        email: `owner-${suffix}@example.com`,
    });
    const user = await User.create({
        domain: domain._id,
        userId: `user-${suffix}`,
        email: `member-${suffix}@example.com`,
        active: true,
        subscribedToUpdates: true,
        unsubscribeToken: suffix,
        purchases: [
            { courseId: "course", accessibleGroups: [], completedLessons: [] },
        ],
    });
    const member = await Membership.create({
        domain: domain._id,
        membershipId: `member-${suffix}`,
        userId: user.userId,
        entityId: "course",
        entityType: "course",
        status: "active",
        paymentPlanId: `plan-${suffix}`,
        sessionId: "session",
        subscriptionId: "sub_monthly",
        subscriptionMethod: "stripe",
        accessActivation: {
            sessionId: "session",
            startedAt: new Date(now.getTime() - 15 * day),
        },
    });
    await PaymentPlan.create({
        domain: domain._id,
        userId: "author",
        planId: member.paymentPlanId,
        name: "Monthly",
        entityId: "course",
        entityType: "course",
        type: "subscription",
        subscriptionMonthlyAmount: 50,
    });
    await Course.create({
        domain: domain._id,
        courseId: "course",
        title: "Practice library",
        slug: `course-${suffix}`,
        cost: 0,
        costType: "free",
        privacy: "public",
        type: "course",
        creatorId: "author",
        published: true,
        groups: [
            {
                _id: "open",
                name: "Open",
                rank: 0,
                drip: { status: false, type: "relative-date" },
                lessonsOrder: ["archive", "drop"],
            },
        ],
    });
    await Lesson.insertMany(
        [
            { lessonId: "archive", date: new Date(now.getTime() - 40 * day) },
            { lessonId: "drop", date: new Date(now.getTime() - 5 * day) },
        ].map((item) => ({
            domain: domain._id,
            courseId: "course",
            lessonId: item.lessonId,
            title: item.lessonId,
            type: "text",
            creatorId: "author",
            groupId: "open",
            published: true,
            requiresEnrollment: true,
            publication: {
                kind: "known",
                firstPublishedAt: item.date,
                source: "native",
            },
        })),
    );
    // This fixture represents an archive already open before membership began.
    await Course.updateOne(
        { domain: domain._id, courseId: "course" },
        { $set: { updatedAt: new Date(now.getTime() - 40 * day) } },
        { timestamps: false },
    );
    await Lesson.updateOne(
        { domain: domain._id, lessonId: "archive" },
        { $set: { updatedAt: new Date(now.getTime() - 40 * day) } },
        { timestamps: false },
    );
    await Lesson.updateOne(
        { domain: domain._id, lessonId: "drop" },
        { $set: { updatedAt: new Date(now.getTime() - 5 * day) } },
        { timestamps: false },
    );
    const key = {
        domainId: String(domain._id),
        userId: user.userId,
        courseId: "course",
        membershipId: member.membershipId,
        membershipSessionId: member.sessionId,
    };
    await ensureMembershipAccess({
        domainId: key.domainId,
        membership: member,
    });
    await Invoice.create({
        domain: domain._id,
        invoiceId: `invoice-${suffix}`,
        membershipId: member.membershipId,
        membershipSessionId: member.sessionId,
        amount: 50,
        status: Constants.InvoiceStatus.PAID,
        paymentProcessor: "stripe",
        paymentMode: "test",
        paymentProcessorTransactionId: "in_current",
        currencyISOCode: "NZD",
    });
    const start = Math.floor((now.getTime() - 10 * day) / 1000),
        end = Math.floor((now.getTime() + 20 * day) / 1000);
    const sub: any = {
        id: "sub_monthly",
        customer: "cus_member",
        livemode: false,
        status: "active",
        current_period_start: start,
        current_period_end: end,
        latest_invoice: "in_current",
        metadata: {},
        items: {
            has_more: false,
            data: [
                {
                    id: "si_monthly",
                    subscription: "sub_monthly",
                    quantity: 1,
                    price: {
                        id: "price_monthly",
                        currency: "nzd",
                        livemode: false,
                        recurring: {
                            interval: "month",
                            interval_count: 1,
                            usage_type: "licensed",
                        },
                    },
                },
            ],
        },
    };
    const invoice: any = {
        id: "in_current",
        subscription: sub.id,
        customer: sub.customer,
        charge: "ch_current",
        payment_intent: "pi_current",
        livemode: false,
        currency: "nzd",
        billing_reason: "subscription_cycle",
        amount_paid: 5000,
        amount_due: 5000,
        total: 5000,
        amount_remaining: 0,
        starting_balance: 0,
        ending_balance: 0,
        paid: true,
        paid_out_of_band: false,
        status: "paid",
        lines: {
            has_more: false,
            data: [
                {
                    id: "il_current",
                    type: "subscription",
                    subscription: sub.id,
                    subscription_item: "si_monthly",
                    price: { id: "price_monthly" },
                    quantity: 1,
                    currency: "nzd",
                    proration: false,
                    period: { start, end },
                },
            ],
        },
    };
    const charge: any = {
        id: "ch_current",
        customer: sub.customer,
        invoice: invoice.id,
        payment_intent: invoice.payment_intent,
        amount: 5000,
        amount_captured: 5000,
        amount_refunded: 0,
        livemode: false,
        currency: "nzd",
        paid: true,
        captured: true,
        status: "succeeded",
        disputed: false,
    };
    const refunds: any[] = [];
    const api = {
        subscriptions: {
            retrieve: jest.fn(async () => sub),
            cancel: jest.fn(async () => {
                sub.status = "canceled";
                return sub;
            }),
        },
        invoices: { retrieve: jest.fn(async () => invoice) },
        charges: { retrieve: jest.fn(async () => charge) },
        refunds: {
            list: jest.fn(async () => ({ data: refunds, has_more: false })),
            create: jest.fn(async (body: any) => {
                const refund = {
                    id: "re_operation",
                    charge: charge.id,
                    amount: body.amount,
                    currency: charge.currency,
                    status: "succeeded",
                    metadata: body.metadata,
                };
                refunds.push(refund);
                charge.amount_refunded += body.amount;
                return refund;
            }),
        },
    };
    const deps: BillingDependencies = {
        provider: jest.fn(async () => ({
            client: api as unknown as StripeCancellationClient,
            livemode: false,
        })),
        now: () => now,
    };
    return {
        ctx: { subdomain: domain, user } as any,
        domain,
        user,
        member,
        key,
        sub,
        invoice,
        charge,
        refunds,
        api,
        deps,
        now,
    };
}
export async function cleanup() {
    jest.restoreAllMocks();
    for (const model of [
        BillingCancellation,
        MembershipAccessModel,
        Invoice,
        Membership,
        PaymentPlan,
        Lesson,
        Course,
        User,
        Domain,
    ])
        await (model as any).deleteMany({});
}
