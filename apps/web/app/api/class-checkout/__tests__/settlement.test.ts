import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { getPaymentMethodFromSettings } from "@/payments-new";
import { POST } from "../../payment/initiate/route";
import { POST as verifyPayment } from "../../payment/verify-new/route";
import { GET as getStatus } from "../status/route";
import { activateMembership } from "../../payment/helpers";
import { recordStripeInvoice } from "../../payment/webhook/stripe-invoice";
import type Stripe from "stripe";
import { completeClassBooking } from "@/services/class-checkout/activation";
import { classCheckoutStatus } from "@/services/class-checkout/status";
import { deleteUserClassCheckoutReservations } from "@/services/class-checkout/cleanup";
import { CheckoutReservation } from "@/services/class-checkout/reservation";
import { readRefundClassEvidence } from "@/services/refund-requests/booking";
import { beginAccountClosure } from "../../../../../../packages/common-logic/src/account-lifecycle/gate";
import Cohort from "@/models/Cohort";
import { MembershipModel as Membership } from "@/services/member-billing/models";
import Invoice from "@/models/Invoice";
import Booking from "@/models/RefundBookingEvidence";
import Intent from "@/models/ClassCheckoutIntent";
import { fixture } from "./fixtures";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/payments-new", () => ({
    getPaymentMethodFromSettings: jest.fn(),
}));
let f: Awaited<ReturnType<typeof fixture>>;
let initiate: jest.Mock;
beforeEach(async () => {
    f = await fixture();
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { email: f.user.email },
    });
    initiate = jest
        .fn()
        .mockResolvedValue("https://checkout.stripe.com/c/pay/cs_test_example");
    (getPaymentMethodFromSettings as jest.Mock).mockResolvedValue({
        name: "stripe",
        initiate,
        getCurrencyISOCode: async () => "nzd",
    });
});
function request(
    choice: unknown = {
        cohortId: f.cohort.cohortId,
        fingerprint: f.fingerprint,
    },
) {
    return new NextRequest("http://localhost/api/payment/initiate", {
        method: "POST",
        headers: {
            domain: f.domain.name,
            origin: "http://localhost",
            "content-type": "application/json",
        },
        body: JSON.stringify({
            id: f.course.courseId,
            type: "course",
            planId: f.plan.planId,
            origin: "http://localhost",
            ...(choice ? { classChoice: choice } : {}),
        }),
    });
}
async function currentIntent() {
    const intent = await Intent.findOne({ domain: f.domain._id }).lean();
    if (!intent) throw new Error("Missing intent");
    return intent;
}
async function settle(amount = 10) {
    const intent = await currentIntent();
    await Membership.updateOne(
        { _id: f.member._id },
        { $set: { status: "active", sessionId: intent.membershipSessionId } },
    );
    await Invoice.updateOne(
        { domain: f.domain._id, invoiceId: intent.invoiceId },
        {
            $set: {
                status: "paid",
                amount,
                currencyISOCode: "NZD",
                paymentProcessorTransactionId: "cs_test_example",
                paymentMode: "test",
                settlement: {
                    source: "stripe-checkout-confirmed",
                    at: new Date(),
                },
            },
        },
    );
    return intent;
}
it.each([
    null,
    { cohortId: "foreign", fingerprint: "a".repeat(64) },
    {
        cohortId: "injected",
        fingerprint: "a".repeat(64),
        classStart: "2030-01-01",
    },
])(
    "rejects missing/foreign/extra date input before financial allocation",
    async (choice) => {
        expect((await POST(request(choice))).status).toBeGreaterThanOrEqual(
            400,
        );
        expect(await Intent.countDocuments({ domain: f.domain._id })).toBe(0);
        expect(initiate).not.toHaveBeenCalled();
    },
);
it("blocks active owners without changing session or calling the provider", async () => {
    await Membership.updateOne(
        { _id: f.member._id },
        { $set: { status: "active" } },
    );
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("before paying");
    expect((await Membership.findById(f.member._id).lean())?.sessionId).toBe(
        f.member.sessionId,
    );
    expect(initiate).not.toHaveBeenCalled();
});
it("persists exact booking before provider and keeps an uncertain attempt blocked with its order reference", async () => {
    initiate.mockImplementation(async () => {
        const intent = await currentIntent();
        expect(intent.state.kind).toBe("creating");
        expect(
            await Booking.countDocuments({
                domain: f.domain._id,
                invoiceId: intent.invoiceId,
                membershipSessionId: intent.membershipSessionId,
                source: "checkout",
                "checkout.intentId": intent.id,
            }),
        ).toBe(1);
        throw new Error("Lost acknowledgement after possible Stripe creation");
    });
    const response = await POST(request());
    expect(response.status).toBe(409);
    const intent = await currentIntent();
    expect(intent.state.kind).toBe("uncertain");
    expect(await response.text()).toContain(intent.invoiceId);
    expect((await POST(request())).status).toBe(409);
    expect(initiate).toHaveBeenCalledTimes(1);
    expect(
        await classCheckoutStatus(
            String(f.domain._id),
            f.user.userId,
            f.course.courseId,
        ),
    ).toEqual({ kind: "pending", reference: intent.invoiceId });
});
it("joins only the selected cohort exactly once, including native promotion-code settlement", async () => {
    const other = await Cohort.create({
        domain: f.domain._id,
        cohortId: randomUUID(),
        courseId: f.course.courseId,
        name: "Unselected class",
        checkoutState: "listed-open",
        schedule: { startAt: new Date(Date.now() + 45 * 86400000) },
    });
    expect((await POST(request())).status).toBe(200);
    const intent = await settle(5);
    await completeClassBooking(
        String(f.domain._id),
        f.user.userId,
        intent.membershipId,
        intent.membershipSessionId,
    );
    await completeClassBooking(
        String(f.domain._id),
        f.user.userId,
        intent.membershipId,
        intent.membershipSessionId,
    );
    expect((await Cohort.findById(f.cohort._id).lean())?.members).toEqual([
        f.user.userId,
    ]);
    expect((await Cohort.findById(other._id).lean())?.members).toEqual([]);
    expect((await currentIntent()).state.kind).toBe("completed");
    const receipt = {
        invoice: await Invoice.findOne({ invoiceId: intent.invoiceId }),
        membership: await Membership.findById(f.member._id),
        course: f.course,
    };
    expect((await readRefundClassEvidence(f.ctx, receipt as any)).kind).toBe(
        "verified",
    );
    // Later rejoin cannot replace the historical invoice/session evidence.
    await Membership.updateOne(
        { _id: f.member._id },
        { $set: { sessionId: "later-session" } },
    );
    expect(
        (
            await readRefundClassEvidence(f.ctx, {
                ...receipt,
                membership: await Membership.findById(f.member._id),
            } as any)
        ).kind,
    ).toBe("verified");
    await Cohort.updateOne(
        { _id: f.cohort._id },
        { $set: { "schedule.startAt": new Date(Date.now() + 90 * 86400000) } },
    );
    expect((await readRefundClassEvidence(f.ctx, receipt as any)).kind).toBe(
        "unknown",
    );
    expect(
        new Date(
            (await Booking.findOne({
                invoiceId: intent.invoiceId,
            }))!.classStart,
        ).getTime(),
    ).toBe(new Date(intent.booking.startAt).getTime());
});
it("completes a native uppercase Stripe settlement and reuses its original booking on callback recovery", async () => {
    const other = await Cohort.create({
        domain: f.domain._id,
        cohortId: randomUUID(),
        courseId: f.course.courseId,
        name: "Another class date",
        checkoutState: "listed-open",
        schedule: { startAt: new Date(Date.now() + 45 * 86400000) },
    });
    expect((await POST(request())).status).toBe(200);
    const intent = await currentIntent();
    expect(intent.currency).toBe("nzd");
    const member = (await Membership.findById(f.member._id))!;
    const event = {
        id: "evt_class_settled",
        type: "checkout.session.completed",
        created: 1788780000,
        livemode: false,
        data: {
            object: {
                id: "cs_test_example",
                amount_total: 1000,
                currency: "nzd",
            },
        },
    } as unknown as Stripe.Event;
    const invoice = await recordStripeInvoice(
        event,
        f.domain._id,
        intent.invoiceId,
        member,
    );
    expect(invoice?.currencyISOCode).toBe("NZD");
    const bookingBefore = await Booking.findOne({
        invoiceId: intent.invoiceId,
    }).lean();
    await activateMembership(f.domain as any, member, f.plan);
    expect((await currentIntent()).state.kind).toBe("completed");
    expect((await Cohort.findById(f.cohort._id).lean())?.members).toEqual([
        f.user.userId,
    ]);
    expect((await Cohort.findById(other._id).lean())?.members).toEqual([]);
    const completedBefore = await currentIntent();
    await recordStripeInvoice(event, f.domain._id, intent.invoiceId, member);
    await activateMembership(f.domain as any, member, f.plan);
    expect(await currentIntent()).toEqual(completedBefore);
    expect(
        await Booking.findOne({ invoiceId: intent.invoiceId }).lean(),
    ).toEqual(bookingBefore);
    expect(await Invoice.countDocuments({ domain: f.domain._id })).toBe(1);
    expect((await Cohort.findById(f.cohort._id).lean())?.members).toEqual([
        f.user.userId,
    ]);
    expect((await Cohort.findById(other._id).lean())?.members).toEqual([]);
});
it.each([
    "unpaid",
    "stale-session",
    "evidence-mismatch",
    "closed-account",
    "currency-mismatch",
    "overpayment",
])("refuses %s completion without adding a roster member", async (mode) => {
    await POST(request());
    const intent = mode === "unpaid" ? await currentIntent() : await settle();
    if (mode === "stale-session")
        await Membership.updateOne(
            { _id: f.member._id },
            { $set: { sessionId: "replacement" } },
        );
    if (mode === "evidence-mismatch")
        await Booking.updateOne(
            { invoiceId: intent.invoiceId },
            { $set: { userId: "another-user" } },
        );
    if (mode === "currency-mismatch")
        await Invoice.updateOne(
            { invoiceId: intent.invoiceId },
            { $set: { currencyISOCode: "USD" } },
        );
    if (mode === "overpayment")
        await Invoice.updateOne(
            { invoiceId: intent.invoiceId },
            { $set: { amount: 11 } },
        );
    if (mode === "closed-account")
        await beginAccountClosure({
            domainId: String(f.domain._id),
            userId: f.user.userId,
        });
    await expect(
        completeClassBooking(
            String(f.domain._id),
            f.user.userId,
            intent.membershipId,
            intent.membershipSessionId,
        ),
    ).rejects.toBeDefined();
    expect((await Cohort.findById(f.cohort._id).lean())?.members).toEqual([]);
});
it("account cleanup waits for in-flight allocation, then erases only idle reservation data and retains financial evidence", async () => {
    let started!: () => void, release!: () => void;
    const reached = new Promise<void>((r) => {
        started = r;
    });
    const paused = new Promise<void>((r) => {
        release = r;
    });
    initiate.mockImplementation(async () => {
        started();
        await paused;
        return "https://checkout.stripe.com/c/pay/cs_test_example";
    });
    const running = POST(request());
    await reached;
    await expect(
        deleteUserClassCheckoutReservations(
            String(f.domain._id),
            f.user.userId,
        ),
    ).rejects.toMatchObject({ code: "account_busy" });
    expect(
        await CheckoutReservation.countDocuments({
            domain: f.domain._id,
            "state.kind": "held",
        }),
    ).toBe(1);
    release();
    await running;
    await deleteUserClassCheckoutReservations(
        String(f.domain._id),
        f.user.userId,
    );
    expect(
        await CheckoutReservation.countDocuments({ domain: f.domain._id }),
    ).toBe(0);
    expect(await Intent.countDocuments({ domain: f.domain._id })).toBe(1);
    expect(await Booking.countDocuments({ domain: f.domain._id })).toBe(1);
    expect((await POST(request())).status).toBe(409);
    expect(
        await CheckoutReservation.countDocuments({ domain: f.domain._id }),
    ).toBe(0);
});
it("rechecks the frozen date before paid roster activation and reports paid review instead of a new checkout", async () => {
    await POST(request());
    const intent = await settle();
    await Membership.updateOne(
        { _id: f.member._id },
        { $set: { status: "pending" } },
    );
    await Cohort.updateOne(
        { _id: f.cohort._id },
        {
            $set: { "schedule.startAt": new Date(Date.now() + 70 * 86400000) },
            $inc: { checkoutRevision: 1 },
        },
    );
    await expect(
        activateMembership(
            f.domain as any,
            (await Membership.findById(f.member._id))!,
            f.plan,
        ),
    ).rejects.toMatchObject({ code: "class_booking_pending" });
    expect((await Cohort.findById(f.cohort._id).lean())?.members).toEqual([]);
    expect((await Membership.findById(f.member._id).lean())?.status).toBe(
        "active",
    );
    expect(
        await classCheckoutStatus(
            String(f.domain._id),
            f.user.userId,
            f.course.courseId,
        ),
    ).toEqual({
        kind: "paid-review",
        reference: intent.invoiceId,
        selectedStart: new Date(intent.booking.startAt).toISOString(),
        membership: "active",
    });
});
it("retires only a proved no-provider attempt when the listing changes during allocation, then permits a reviewed new attempt", async () => {
    const create = Booking.create.bind(Booking);
    const spy = jest
        .spyOn(Booking, "create")
        .mockImplementationOnce(async (...args: any[]) => {
            const result = await (create as any)(...args);
            await Cohort.updateOne(
                { _id: f.cohort._id },
                { $set: { checkoutState: "listed-closed" } },
            );
            return result;
        });
    expect((await POST(request())).status).toBe(409);
    spy.mockRestore();
    const intent = await currentIntent();
    expect(intent.state.kind).toBe("not-started");
    expect(
        (await Invoice.findOne({ invoiceId: intent.invoiceId }))?.status,
    ).toBe("failed");
    expect(initiate).not.toHaveBeenCalled();
    await Cohort.updateOne(
        { _id: f.cohort._id },
        { $set: { checkoutState: "listed-open" } },
    );
    expect((await POST(request())).status).toBe(200);
    expect(initiate).toHaveBeenCalledTimes(1);
    expect(await Intent.countDocuments({ domain: f.domain._id })).toBe(2);
});
it("does not repeat provider creation after losing the native result save", async () => {
    const spy = jest.spyOn(Invoice, "updateOne").mockImplementationOnce(() => {
        throw new Error("Database unavailable after provider response");
    });
    expect((await POST(request())).status).toBe(409);
    spy.mockRestore();
    expect((await currentIntent()).state.kind).toBe("uncertain");
    expect((await POST(request())).status).toBe(409);
    expect(initiate).toHaveBeenCalledTimes(1);
});
it("native verification reports the owned exact paid order's class review without a provider call", async () => {
    await POST(request());
    const intent = await settle();
    const verify = () =>
        new NextRequest("http://localhost/api/payment/verify-new", {
            method: "POST",
            headers: {
                domain: f.domain.name,
                "content-type": "application/json",
            },
            body: JSON.stringify({ id: intent.invoiceId }),
        });
    const response = await verifyPayment(verify());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        status: "paid",
        classBooking: {
            kind: "paid-review",
            reference: intent.invoiceId,
            membership: "active",
            selectedStart: new Date(intent.booking.startAt).toISOString(),
        },
    });
    expect(initiate).toHaveBeenCalledTimes(1);
    await completeClassBooking(
        String(f.domain._id),
        f.user.userId,
        intent.membershipId,
        intent.membershipSessionId,
    );
    expect(await (await verifyPayment(verify())).json()).toMatchObject({
        status: "paid",
        classBooking: { kind: "completed", reference: intent.invoiceId },
    });
    const other = await fixture();
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { email: other.user.email },
    });
    const foreign = new NextRequest("http://localhost/api/payment/verify-new", {
        method: "POST",
        headers: { domain: other.domain.name },
        body: JSON.stringify({ id: intent.invoiceId }),
    });
    expect((await verifyPayment(foreign)).status).toBe(404);
});
it("status refuses anonymous, foreign-owner and Mimic access to a saved booking", async () => {
    await POST(request());
    const status = (headers = {}) =>
        new NextRequest(
            `http://localhost/api/class-checkout/status?courseId=${f.course.courseId}`,
            { headers: { domain: f.domain.name, ...headers } },
        );
    expect(
        (await getStatus(status({ cookie: "courselit.member-mimic=present" })))
            .status,
    ).toBe(403);
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(null);
    expect((await getStatus(status())).status).toBe(401);
    const other = await fixture();
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { email: other.user.email },
    });
    expect((await getStatus(status())).status).toBe(401);
});
