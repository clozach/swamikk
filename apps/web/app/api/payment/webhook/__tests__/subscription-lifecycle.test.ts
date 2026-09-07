import mongoose from "mongoose";
import { createHash } from "crypto";
import { addIncludedProductsMemberships } from "@/graphql/paymentplans/logic";
import Stripe from "stripe";
import { Constants } from "@courselit/common-models";
import Binding from "@/models/StripeSubscriptionBinding";
import Receipt from "@/models/StripeWebhookReceipt";
import Invoice from "@/models/Invoice";
import Plan from "@/models/PaymentPlan";
import {
    AccessCourseModel as Course,
    AccessLessonModel as Lesson,
    AccessMembershipModel as Membership,
    AccessUserModel as User,
    MembershipAccessModel as Access,
} from "../../../../../../../packages/common-logic/src/member-access/models";
import {
    ensureMembershipAccess,
    prepareRetention,
} from "../../../../../../../packages/common-logic/src/member-access/lifecycle";
import { getLessonAccess } from "../../../../../../../packages/common-logic/src/member-access/read";
import {
    beginAccountClosure,
    reopenAccountBeforeErasure,
} from "../../../../../../../packages/common-logic/src/account-lifecycle/gate";
import { AccountLifecycleModel } from "../../../../../../../packages/common-logic/src/account-lifecycle/model";
import {
    reconcileSubscription,
    hasConfirmedSubscriptionEnd,
} from "@/payments-new/stripe-lifecycle/subscription";
import { bindSubscription } from "@/payments-new/stripe-lifecycle/binding";
import { activateMembership } from "../../helpers";
import { runPostMembershipTasks } from "@/graphql/users/logic";
import Domain from "@/models/Domain";
import StripePayment from "@/payments-new/stripe-payment";
import { getPaymentMethod } from "@/payments-new";
import { POST } from "../route";
import { claimDelivery } from "../../../../../../../packages/common-logic/src/member-access/drip";

jest.mock("@/graphql/users/logic", () => ({
    runPostMembershipTasks: jest.fn(),
}));
jest.mock("@/payments-new", () => ({ getPaymentMethod: jest.fn() }));
let domainId: string, member: any, plan: any, subscription: any, provider: any;
const start = new Date("2026-02-01"),
    cutoff = new Date("2026-02-10");
const event = (id = "evt_end") =>
    ({
        id,
        type: "customer.subscription.deleted",
        livemode: false,
        data: { object: { id: "sub_native" } },
    }) as unknown as Stripe.Event;
const key = () => ({
    domainId,
    userId: "member",
    courseId: "course",
    membershipId: member.membershipId,
    membershipSessionId: "session",
});
const read = (lessonId: string) =>
    getLessonAccess({ ...key(), lessonId, requireMembership: true });
const reconcile = (id?: string) =>
    reconcileSubscription(domainId, event(id), provider, "sub_native");

beforeEach(async () => {
    jest.clearAllMocks();
    domainId = String(new mongoose.Types.ObjectId());
    await Domain.create({
        _id: domainId,
        name: `school-${domainId}`,
        email: "owner@example.com",
    });
    await User.create({
        domain: domainId,
        userId: "member",
        email: "member@example.com",
        active: true,
    });
    member = await Membership.create({
        domain: domainId,
        membershipId: `member-${domainId}`,
        sessionId: "session",
        userId: "member",
        entityId: "course",
        entityType: "course",
        paymentPlanId: `plan-${domainId}`,
        status: "active",
        subscriptionId: "sub_native",
        subscriptionMethod: "stripe",
        accessActivation: { sessionId: "session", startedAt: start },
    });
    plan = await Plan.create({
        domain: domainId,
        planId: member.paymentPlanId,
        name: "Monthly",
        type: Constants.PaymentPlanType.SUBSCRIPTION,
        entityId: "course",
        entityType: "course",
        userId: "author",
        subscriptionMonthlyAmount: 11,
    });
    await Invoice.create({
        domain: domainId,
        invoiceId: `order-${domainId}`,
        membershipId: member.membershipId,
        membershipSessionId: "session",
        amount: 11,
        currencyISOCode: "NZD",
        paymentProcessor: "stripe",
        paymentMode: "test",
        status: "paid",
    });
    await Course.create({
        domain: domainId,
        courseId: "course",
        title: "Library",
        slug: `library-${domainId}`,
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
                lessonsOrder: ["archive", "drop", "after", "unknown"],
            },
        ],
    });
    await Lesson.insertMany(
        [
            ["archive", "2026-01-01"],
            ["drop", "2026-02-05"],
            ["after", "2026-02-11"],
            ["unknown", null],
        ].map(([lessonId, date]) => ({
            domain: domainId,
            courseId: "course",
            lessonId,
            title: lessonId,
            type: "text",
            creatorId: "author",
            published: true,
            requiresEnrollment: true,
            groupId: "open",
            ...(date
                ? {
                      publication: {
                          kind: "known",
                          firstPublishedAt: new Date(date),
                          source: "native",
                      },
                  }
                : {}),
        })),
    );
    await ensureMembershipAccess({ domainId, membership: member });
    // The fixture is historical: these native rows already held this context before the cutoff.
    await Course.updateMany(
        { domain: domainId },
        { $set: { updatedAt: new Date("2026-01-01") } },
        { timestamps: false },
    );
    for (const lesson of await Lesson.find({ domain: domainId }))
        await Lesson.updateOne(
            { _id: lesson._id },
            {
                $set: {
                    updatedAt:
                        lesson.publication?.kind === "known"
                            ? lesson.publication.firstPublishedAt
                            : new Date("2026-01-01"),
                },
            },
            { timestamps: false },
        );
    subscription = {
        id: "sub_native",
        customer: "cus_native",
        livemode: false,
        status: "canceled",
        ended_at: cutoff.getTime() / 1000,
        canceled_at: new Date("2026-02-02").getTime() / 1000,
        cancel_at_period_end: false,
        metadata: {
            membershipId: member.membershipId,
            invoiceId: `order-${domainId}`,
        },
    };
    provider = {
        subscriptions: { retrieve: jest.fn(async () => ({ ...subscription })) },
    };
    (runPostMembershipTasks as jest.Mock).mockImplementation(
        async ({ membership }) =>
            ensureMembershipAccess({ domainId, membership }),
    );
});
afterEach(async () => {
    jest.restoreAllMocks();
    for (const model of [
        Binding,
        Receipt,
        Invoice,
        Plan,
        Course,
        Lesson,
        Membership,
        User,
        Access,
        AccountLifecycleModel,
    ] as any[])
        await model.deleteMany({ domain: domainId });
    await Domain.deleteOne({ _id: domainId });
});

it("ends at provider ended_at, keeps proved drops only, and records unknown legacy timing", async () => {
    expect(await read("archive")).toMatchObject({ kind: "allowed" });
    await reconcile();
    expect(await read("drop")).toMatchObject({
        kind: "allowed",
        source: "retained",
    });
    for (const id of ["archive", "after", "unknown"])
        expect(await read(id)).toMatchObject({ kind: "denied" });
    expect((await Binding.findOne({ domain: domainId }))!.state).toMatchObject({
        kind: "ended",
        cutoff,
        unknownReleaseCount: 1,
    });
    expect(
        await hasConfirmedSubscriptionEnd(
            domainId,
            member.membershipId,
            "session",
            "sub_native",
        ),
    ).toBe(true);
});

it("does not end access for a scheduled cancellation or paused/past-due attention state", async () => {
    for (const status of ["active", "paused", "past_due", "unpaid"]) {
        subscription.status = status;
        subscription.cancel_at_period_end = true;
        subscription.ended_at = null;
        await reconcile(`evt_${status}`);
        expect(await read("archive")).toMatchObject({ kind: "allowed" });
        expect(
            (await Binding.findOne({ domain: domainId }))!.state,
        ).toMatchObject({ kind: "observed", status });
    }
});

it("never treats EMI completion as recurring membership ending", async () => {
    await Plan.updateOne(
        { domain: domainId },
        { $set: { type: Constants.PaymentPlanType.EMI } },
    );
    await reconcile();
    expect(await read("archive")).toMatchObject({ kind: "allowed" });
    expect((await Membership.findById(member._id))!.status).toBe("active");
});

it("reuses an earlier manual cutoff and never adds later lessons on retries", async () => {
    const manual = new Date("2026-02-04");
    await prepareRetention({
        ...key(),
        cutoff: manual,
        operationId: "manual-cancel",
    });
    await reconcile();
    await reconcile("evt_duplicate_fact");
    const period = await Access.findOne({ domain: domainId });
    expect(period!.state).toMatchObject({
        kind: "ended",
        operationId: "manual-cancel",
        snapshot: { cutoff: manual, retainedLessonIds: [] },
    });
    expect(await read("drop")).toMatchObject({ kind: "denied" });
});

it("caps an already-prepared later snapshot to an earlier verified external end", async () => {
    await prepareRetention({
        ...key(),
        cutoff: new Date("2026-02-20"),
        operationId: "manual-cancel",
    });
    await reconcile();
    expect((await Access.findOne({ domain: domainId }))!.state).toMatchObject({
        kind: "ended",
        snapshot: { cutoff, retainedLessonIds: ["drop"] },
    });
});

it("keeps a newer membership session active when an old bound subscription ends", async () => {
    subscription.status = "active";
    await bindSubscription(domainId, subscription, "test");
    await Membership.updateOne(
        { _id: member._id },
        {
            $set: {
                sessionId: "rejoin",
                subscriptionId: "sub_rejoin",
                status: "active",
                accessActivation: {
                    sessionId: "rejoin",
                    startedAt: new Date("2026-03-01"),
                },
            },
        },
    );
    subscription.status = "canceled";
    await reconcile();
    expect((await Membership.findById(member._id))!.sessionId).toBe("rejoin");
    expect((await Membership.findById(member._id))!.status).toBe("active");
});

it("rejects mismatched tenant, mode, and subscription without changing native access", async () => {
    await expect(
        reconcileSubscription(
            String(new mongoose.Types.ObjectId()),
            event(),
            provider,
            "sub_native",
        ),
    ).rejects.toMatchObject({ reason: "subscription-order-unavailable" });
    await expect(
        bindSubscription(domainId, subscription, "live"),
    ).rejects.toMatchObject({ reason: "subscription-mode-mismatch" });
    await Membership.updateOne(
        { _id: member._id },
        { $set: { subscriptionId: "sub_another" } },
    );
    await expect(reconcile()).rejects.toMatchObject({
        reason: "subscription-session-mismatch",
    });
    expect(await read("archive")).toMatchObject({ kind: "allowed" });
});

it("holds reads closed while another activation owns a claim, then ends late included rows", async () => {
    subscription.status = "active";
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
        enter = resolve;
    });
    const released = new Promise<void>((resolve) => {
        release = resolve;
    });
    const activating = reconcileSubscription(
        domainId,
        event("evt_paid"),
        provider,
        "sub_native",
        async () => {
            enter();
            await released;
            await Membership.create({
                domain: domainId,
                membershipId: `late-${domainId}`,
                userId: "member",
                sessionId: "session",
                entityId: "course",
                entityType: "course",
                paymentPlanId: member.paymentPlanId,
                isIncludedInPlan: true,
                status: "active",
            });
            return Response.json({ message: "paid" });
        },
    );
    await entered;
    subscription.status = "canceled";
    await expect(reconcile()).rejects.toMatchObject({
        reason: "subscription-reconciliation-in-progress",
    });
    expect(await read("archive")).toMatchObject({ kind: "denied" });
    release();
    await activating;
    expect(
        await Membership.countDocuments({ domain: domainId, status: "active" }),
    ).toBe(0);
    expect((await Binding.findOne({ domain: domainId }))!.state.kind).toBe(
        "ended",
    );
});

it("the whole native activation reserves account closure before its membership CAS", async () => {
    await Membership.updateOne(
        { _id: member._id },
        { $set: { status: "pending" } },
    );
    const original = Membership.findOneAndUpdate.bind(Membership);
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
        enter = resolve;
    });
    const released = new Promise<void>((resolve) => {
        release = resolve;
    });
    jest.spyOn(Membership, "findOneAndUpdate").mockImplementationOnce(((
        ...args: any[]
    ) => {
        enter();
        return released.then(() => (original as any)(...args));
    }) as any);
    const activating = activateMembership(
        { _id: new mongoose.Types.ObjectId(domainId) } as any,
        member,
        plan,
    ).catch((error) => error);
    await entered;
    expect(
        (await beginAccountClosure({ domainId, userId: "member" })).kind,
    ).toBe("pending");
    release();
    await activating;
});

it("settles financial end evidence without recreating erased account access", async () => {
    await beginAccountClosure({ domainId, userId: "member" });
    await Access.deleteMany({ domain: domainId });
    await User.deleteMany({ domain: domainId });
    await reconcile();
    expect(await Access.countDocuments({ domain: domainId })).toBe(0);
    expect(
        await Binding.countDocuments({
            domain: domainId,
            "state.kind": "ended",
        }),
    ).toBe(1);
});

async function signedPost(input: Stripe.Event, secret = "whsec_lifecycle") {
    const payment = await new StripePayment({
        currencyISOCode: "NZD",
        stripeKey: "pk_test_native",
        stripeSecret: "sk_test_native",
        stripeWebhookSecret: "whsec_lifecycle",
    }).setup();
    payment.stripe.subscriptions.retrieve = provider.subscriptions.retrieve;
    (getPaymentMethod as jest.Mock).mockResolvedValue(payment);
    const payload = JSON.stringify(input);
    const signature = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret,
    });
    return POST({
        headers: new Headers({
            domain: `school-${domainId}`,
            "stripe-signature": signature,
        }),
        text: async () => payload,
    } as any);
}
const paidEvent = () =>
    ({
        id: "evt_checkout",
        type: "checkout.session.completed",
        livemode: false,
        created: Math.floor(Date.now() / 1000),
        data: {
            object: {
                id: "cs_native",
                subscription: "sub_native",
                payment_status: "paid",
                amount_total: 1100,
                currency: "nzd",
                metadata: {
                    membershipId: member.membershipId,
                    invoiceId: `order-${domainId}`,
                },
            },
        },
    }) as unknown as Stripe.Event;

it("signed end callbacks are idempotent and wrong signatures make no financial or access changes", async () => {
    expect((await signedPost(event(), "whsec_other")).status).toBe(400);
    expect(await Binding.countDocuments({ domain: domainId })).toBe(0);
    expect((await signedPost(event())).status).toBe(200);
    expect((await signedPost(event())).status).toBe(200);
    expect(await Receipt.countDocuments({ domain: domainId })).toBe(1);
    expect((await Receipt.findOne({ domain: domainId }))!.state.kind).toBe(
        "complete",
    );
});

it("records a delayed paid checkout after the end event without reviving its membership", async () => {
    await Invoice.updateOne(
        { domain: domainId },
        { $set: { status: "pending" } },
    );
    await Membership.updateOne(
        { _id: member._id },
        { $set: { status: "pending" } },
    );
    expect((await signedPost(event())).status).toBe(200);
    expect((await signedPost(paidEvent())).status).toBe(200);
    expect((await Invoice.findOne({ domain: domainId })).status).toBe("paid");
    expect((await Membership.findById(member._id))!.status).toBe("expired");
    expect(runPostMembershipTasks).not.toHaveBeenCalled();
});

it("records a historical renewal against its original session without changing a rejoin", async () => {
    subscription.status = "active";
    await bindSubscription(domainId, subscription, "test");
    await Membership.updateOne(
        { _id: member._id },
        { $set: { sessionId: "rejoin", subscriptionId: "sub_rejoin" } },
    );
    subscription.status = "canceled";
    const renewal = {
        id: "evt_renewal",
        type: "invoice.paid",
        livemode: false,
        data: {
            object: {
                id: "in_renewal",
                subscription: "sub_native",
                billing_reason: "subscription_cycle",
                amount_paid: 1100,
                currency: "nzd",
                subscription_details: { metadata: subscription.metadata },
            },
        },
    } as Stripe.Event;
    expect((await signedPost(renewal)).status).toBe(200);
    expect((await signedPost(renewal)).status).toBe(200);
    expect(
        (
            await Invoice.findOne({
                domain: domainId,
                paymentProcessorTransactionId: "in_renewal",
            })
        ).membershipSessionId,
    ).toBe("session");
    expect((await Membership.findById(member._id))!.sessionId).toBe("rejoin");
    expect(runPostMembershipTasks).not.toHaveBeenCalled();
});

it("signed irrelevant events are acknowledged without payment mutations", async () => {
    const input = { ...event(), type: "customer.updated" } as Stripe.Event;
    expect((await signedPost(input)).status).toBe(200);
    expect(await Binding.countDocuments({ domain: domainId })).toBe(0);
    expect(await Receipt.countDocuments({ domain: domainId })).toBe(0);
});

it("rejects subscription metadata that contradicts its existing native owner", async () => {
    const other = await Membership.create({
        domain: domainId,
        membershipId: `other-${domainId}`,
        sessionId: "other-session",
        userId: "member",
        entityId: "course",
        entityType: "course",
        paymentPlanId: plan.planId,
        status: "pending",
    });
    await Invoice.create({
        domain: domainId,
        invoiceId: `other-order-${domainId}`,
        membershipId: other.membershipId,
        membershipSessionId: other.sessionId,
        amount: 11,
        currencyISOCode: "NZD",
        paymentProcessor: "stripe",
        status: "pending",
    });
    subscription.metadata = {
        membershipId: other.membershipId,
        invoiceId: `other-order-${domainId}`,
    };
    await expect(reconcile()).rejects.toMatchObject({
        reason: "subscription-native-owner-mismatch",
    });
    expect((await Membership.findById(other._id))!.status).toBe("pending");
    expect(await Binding.countDocuments({ domain: domainId })).toBe(0);
});

it("retains a historical included drop after both native membership rows have been reused for rejoin", async () => {
    await Access.deleteMany({ domain: domainId });
    await Membership.updateOne(
        { _id: member._id },
        { $set: { entityId: "community", entityType: "community" } },
    );
    await Plan.updateOne(
        { _id: plan._id },
        {
            $set: {
                entityId: "community",
                entityType: "community",
                includedProducts: ["course"],
            },
        },
    );
    const child = await Membership.create({
        domain: domainId,
        membershipId: `legacy-child-${domainId}`,
        userId: "member",
        sessionId: "session",
        entityId: "course",
        entityType: "course",
        paymentPlanId: plan.planId,
        isIncludedInPlan: true,
        status: "active",
        accessActivation: { sessionId: "session", startedAt: start },
    });
    await ensureMembershipAccess({ domainId, membership: child });
    subscription.status = "active";
    await bindSubscription(domainId, subscription, "test");
    await Membership.updateMany(
        { domain: domainId },
        { $set: { sessionId: "rejoin", status: "active" } },
    );
    subscription.status = "canceled";
    await reconcile();
    await Membership.updateMany(
        { domain: domainId },
        { $set: { status: "expired" } },
    );
    expect(await read("drop")).toMatchObject({
        kind: "allowed",
        source: "retained",
    });
    expect(await read("archive")).toMatchObject({ kind: "denied" });
});

it("does not retain a lesson when its group was opened only after the provider cutoff", async () => {
    // The publication date is real, but today's open group does not prove an old release.
    await Course.updateOne(
        { domain: domainId },
        {
            $set: {
                "groups.0.drip.status": false,
                updatedAt: new Date("2026-02-11"),
            },
        },
        { timestamps: false },
    );
    await reconcile();
    expect(await read("drop")).toMatchObject({ kind: "denied" });
    expect((await Binding.findOne({ domain: domainId }))!.state).toMatchObject({
        kind: "ended",
        unknownReleaseCount: 3,
    });
});

it("also withholds a schedule change that overtakes a member's captured confirmation cutoff", async () => {
    await Course.updateOne(
        { domain: domainId },
        {
            $set: {
                "groups.0.drip.status": false,
                updatedAt: new Date(cutoff.getTime() + 1),
            },
        },
        { timestamps: false },
    );
    const result = await prepareRetention({
        ...key(),
        cutoff,
        operationId: "member-confirm",
    });
    expect(result.snapshot.retainedLessonIds).not.toContain("drop");
    expect(result.snapshot.unknownReleaseCount).toBeGreaterThan(0);
});

it("does not manufacture a new drop from an archived lesson's in-period context edit", async () => {
    await Lesson.updateOne(
        { domain: domainId, lessonId: "archive" },
        { $set: { updatedAt: new Date("2026-02-07") } },
        { timestamps: false },
    );
    await reconcile();
    expect(await read("archive")).toMatchObject({ kind: "denied" });
    expect((await Binding.findOne({ domain: domainId }))!.state).toMatchObject({
        unknownReleaseCount: 2,
    });
});

it("preserves missing legacy context as unknown and native edits record a real context timestamp", async () => {
    await Lesson.collection.updateOne(
        { domain: new mongoose.Types.ObjectId(domainId), lessonId: "drop" },
        { $unset: { updatedAt: "", createdAt: "" } },
    );
    await reconcile();
    expect(await read("drop")).toMatchObject({ kind: "denied" });
    const before = new Date();
    await Lesson.updateOne(
        { domain: domainId, lessonId: "drop" },
        { $set: { title: "A revised title" } },
    );
    const stored = await Lesson.findOne({ domain: domainId, lessonId: "drop" });
    expect(stored!.updatedAt!.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
    );
    expect(stored!.publication).toMatchObject({
        firstPublishedAt: new Date("2026-02-05"),
    });
});

it("freezes the delivery CAS before returning a busy provider reconciliation", async () => {
    subscription.status = "active";
    const binding = await bindSubscription(domainId, subscription, "test");
    await Binding.updateOne(
        { _id: binding._id },
        {
            $set: {
                claim: {
                    id: "stopped-worker",
                    eventId: "evt_old",
                    startedAt: new Date(),
                },
            },
        },
    );
    await Course.updateOne(
        { domain: domainId },
        { $set: { "groups.0.drip.email.published": true } },
    );
    await Access.updateOne(
        { domain: domainId },
        {
            $set: {
                deliveries: [
                    {
                        id: "delivery",
                        groupId: "open",
                        createdAt: start,
                        state: { kind: "pending" },
                    },
                ],
            },
        },
    );
    const period = await Access.findOne({ domain: domainId });
    const original = Access.updateOne.bind(Access);
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
        enter = resolve;
    });
    const released = new Promise<void>((resolve) => {
        release = resolve;
    });
    jest.spyOn(Access, "updateOne").mockImplementation(((...args: any[]) => {
        if (args[0].deliveries) {
            enter();
            return released.then(() => (original as any)(...args));
        }
        return (original as any)(...args);
    }) as any);
    const claiming = claimDelivery(domainId, period!.id, "delivery");
    await entered;
    subscription.status = "canceled";
    await expect(reconcile()).rejects.toMatchObject({
        reason: "subscription-reconciliation-in-progress",
    });
    expect((await Access.findById(period!._id))!.state.kind).toBe("freezing");
    release();
    expect(await claiming).toEqual({ kind: "skipped" });
    expect((await Access.findById(period!._id))!.deliveries[0].state.kind).toBe(
        "pending",
    );
});

it("rejects an oversized webhook before looking up or mutating payment records", async () => {
    const response = await POST(
        new Request("https://school.example/api/payment/webhook", {
            method: "POST",
            headers: { domain: `school-${domainId}` },
            body: "x".repeat(1024 * 1024 + 1),
        }) as any,
    );
    expect(response.status).toBe(400);
    expect(await Receipt.countDocuments({ domain: domainId })).toBe(0);
});

it("reserves the whole paid callback before settling an unattached pending checkout", async () => {
    subscription.status = "active";
    await Invoice.updateOne(
        { domain: domainId },
        { $set: { status: "pending" } },
    );
    await Membership.updateOne(
        { _id: member._id },
        {
            $set: { status: "pending" },
            $unset: { subscriptionId: "", subscriptionMethod: "" },
        },
    );
    const original = Invoice.findOneAndUpdate.bind(Invoice);
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
        enter = resolve;
    });
    const released = new Promise<void>((resolve) => {
        release = resolve;
    });
    jest.spyOn(Invoice, "findOneAndUpdate").mockImplementationOnce(((
        ...args: any[]
    ) => {
        enter();
        return released.then(() => (original as any)(...args));
    }) as any);
    const paying = signedPost(paidEvent());
    await entered;
    expect(
        (await beginAccountClosure({ domainId, userId: "member" })).kind,
    ).toBe("pending");
    release();
    expect((await paying).status).toBe(503);
    expect((await Membership.findById(member._id))!.subscriptionId).toBe(
        "sub_native",
    );
    await reopenAccountBeforeErasure({ domainId, userId: "member" });
    expect((await signedPost(paidEvent())).status).toBe(200);
    expect((await Membership.findById(member._id))!.status).toBe("active");
    expect(await Invoice.countDocuments({ domain: domainId })).toBe(1);
});

it("settles a legacy erased account's money only and records the situation for review", async () => {
    subscription.status = "active";
    await Invoice.updateOne(
        { domain: domainId },
        { $set: { status: "pending" } },
    );
    await beginAccountClosure({ domainId, userId: "member" });
    await User.deleteMany({ domain: domainId });
    await Access.deleteMany({ domain: domainId });
    const response = await signedPost(paidEvent());
    expect(response.status).toBe(202);
    expect((await Invoice.findOne({ domain: domainId })).status).toBe("paid");
    expect((await Receipt.findOne({ domain: domainId }))!.state).toMatchObject({
        kind: "review-required",
        reason: "paid-account-unavailable",
    });
    expect(await Access.countDocuments({ domain: domainId })).toBe(0);
    expect(runPostMembershipTasks).not.toHaveBeenCalled();
});

it("preserves the native included ID and registers it before insertion, then refuses an ended session", async () => {
    subscription.status = "active";
    await bindSubscription(domainId, subscription, "test");
    await Course.create({
        domain: domainId,
        courseId: "added",
        title: "Added",
        slug: `added-${domainId}`,
        cost: 0,
        costType: "free",
        privacy: "public",
        type: "course",
        creatorId: "author",
        published: true,
    });
    plan.includedProducts = ["added"];
    const expected = `included-${createHash("sha256")
        .update(
            JSON.stringify({
                domain: new mongoose.Types.ObjectId(domainId),
                userId: "member",
                entityId: "added",
                entityType: "course",
                paymentPlanId: plan.planId,
                sessionId: "session",
                isIncludedInPlan: true,
            }),
        )
        .digest("hex")}`;
    const update = Membership.updateOne.bind(Membership);
    const spy = jest.spyOn(Membership, "updateOne").mockImplementation(((
        query: any,
        ...args: any[]
    ) => {
        if (query.membershipId !== expected)
            return (update as any)(query, ...args);
        return {
            then: async (resolve: any, reject: any) => {
                try {
                    expect(
                        (await Binding.findOne({ domain: domainId }))!
                            .includedMembershipIds,
                    ).toContain(expected);
                    resolve(await (update as any)(query, ...args));
                } catch (error) {
                    reject(error);
                }
            },
        } as any;
    }) as any);
    const input = {
        domain: new mongoose.Types.ObjectId(domainId),
        userId: "member",
        paymentPlan: plan,
        sessionId: "session",
        startedAt: start,
    };
    await addIncludedProductsMemberships(input);
    await addIncludedProductsMemberships(input);
    spy.mockRestore();
    expect(
        await Membership.countDocuments({
            domain: domainId,
            membershipId: expected,
        }),
    ).toBe(1);
    expect(
        (runPostMembershipTasks as jest.Mock).mock.calls.at(-1)?.[0]
            .recoveryOnly,
    ).toBe(true);
    subscription.status = "canceled";
    await reconcile();
    await expect(addIncludedProductsMemberships(input)).rejects.toThrow(
        "The provider subscription has ended.",
    );
});
