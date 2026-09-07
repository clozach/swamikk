import { proveRefundCharge } from "@/payments-new/stripe-lifecycle/refund-proof";
import mongoose from "mongoose";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import Domain from "@/models/Domain";
import User from "@/models/User";
import Invoice from "@/models/Invoice";
import Membership from "@/models/Membership";
import Ledger from "@/models/StripeChargeRefunds";
import Receipt from "@/models/StripeWebhookReceipt";
import RefundRequest from "@/models/RefundRequest";
import StripePayment from "@/payments-new/stripe-payment";
import { getPaymentMethod } from "@/payments-new";
import { POST } from "../route";
import { readMemberReceipt } from "@/services/member-receipts/read";
import {
    readMemberRefundRequests,
    readOperatorRefundRequests,
} from "@/services/refund-requests/read";
import { accountClosureReview } from "@/services/account-closure/review";
import { withObservedRefund } from "@/payments-new/stripe-lifecycle/refund-projection";

jest.mock("@/payments-new", () => ({ getPaymentMethod: jest.fn() }));
let domain: any,
    user: any,
    membership: any,
    charge: any,
    intent: any,
    invoice: any,
    session: any,
    refunds: any[],
    provider: any,
    payment: StripePayment,
    ctx: any;
const secret = "whsec_refund_test_only";
const makeRefund = (status = "pending", amount = 500, id = "re_one") => ({
    id,
    object: "refund",
    charge: "ch_native",
    payment_intent: "pi_native",
    currency: "nzd",
    amount,
    status,
    created: 1770000000,
});
async function send(
    id: string,
    type = "refund.updated",
    signature = true,
    live = false,
) {
    const body = JSON.stringify({
        id,
        object: "event",
        type,
        livemode: live,
        created: 1770000001,
        data: {
            object: {
                id:
                    type === "charge.refunded"
                        ? charge.id
                        : refunds[0]?.id || "re_one",
                status: "failed",
            },
        },
    });
    return POST(
        new NextRequest("https://school.example/api/payment/webhook", {
            method: "POST",
            body,
            headers: {
                domain: domain.name,
                "stripe-signature": signature
                    ? Stripe.webhooks.generateTestHeaderString({
                          payload: body,
                          secret,
                      })
                    : "invalid",
            },
        }),
    );
}
beforeEach(async () => {
    jest.clearAllMocks();
    const id = String(new mongoose.Types.ObjectId());
    domain = await Domain.create({
        name: `refund-${id}`,
        email: "owner@example.com",
    });
    user = await User.create({
        domain: domain._id,
        userId: `user-${id}`,
        email: `member-${id}@example.com`,
        active: true,
    });
    membership = await Membership.create({
        domain: domain._id,
        membershipId: `member-${id}`,
        userId: user.userId,
        sessionId: "original",
        entityId: "course",
        entityType: "course",
        status: "active",
        paymentPlanId: "plan",
    });
    await Invoice.create({
        domain: domain._id,
        invoiceId: `order-${id}`,
        membershipId: membership.membershipId,
        membershipSessionId: "original",
        status: "paid",
        paymentProcessor: "stripe",
        paymentProcessorTransactionId: "cs_native",
        paymentMode: "test",
        amount: 11,
        currencyISOCode: "NZD",
        settlement: {
            at: new Date("2026-01-01"),
            source: "stripe-checkout-confirmed",
        },
    });
    charge = {
        id: "ch_native",
        payment_intent: "pi_native",
        invoice: null,
        customer: "cus_native",
        livemode: false,
        paid: true,
        captured: true,
        status: "succeeded",
        amount: 1100,
        amount_captured: 1100,
        amount_refunded: 500,
        currency: "nzd",
    };
    intent = {
        id: "pi_native",
        latest_charge: charge.id,
        invoice: null,
        customer: charge.customer,
        livemode: false,
        status: "succeeded",
        currency: charge.currency,
        amount_received: 1100,
    };
    session = {
        id: "cs_native",
        payment_intent: intent.id,
        invoice: null,
        customer: charge.customer,
        mode: "payment",
        status: "complete",
        payment_status: "paid",
        currency: charge.currency,
        amount_total: 1100,
        livemode: false,
        metadata: {
            invoiceId: `order-${id}`,
            membershipId: membership.membershipId,
        },
    };
    invoice = {
        id: "in_native",
        payment_intent: intent.id,
        charge: charge.id,
        customer: charge.customer,
        livemode: false,
        currency: charge.currency,
        amount_paid: 1100,
        paid: true,
        subscription: "sub_native",
        billing_reason: "subscription_create",
    };
    refunds = [makeRefund()];
    provider = {
        charges: { retrieve: jest.fn(async () => ({ ...charge })) },
        paymentIntents: { retrieve: jest.fn(async () => ({ ...intent })) },
        invoices: { retrieve: jest.fn(async () => ({ ...invoice })) },
        checkout: {
            sessions: {
                list: jest.fn(async () => ({
                    data: [{ ...session }],
                    has_more: false,
                })),
            },
        },
        subscriptions: {
            retrieve: jest.fn(async () => ({
                id: "sub_native",
                livemode: false,
                customer: charge.customer,
                metadata: session.metadata,
            })),
        },
        refunds: {
            retrieve: jest.fn(async (id: string) => ({
                ...refunds.find((item) => item.id === id),
            })),
            list: jest.fn(async () => ({
                data: refunds.map((item) => ({ ...item })),
                has_more: false,
            })),
            create: jest.fn(),
        },
    };
    payment = await new StripePayment({
        currencyISOCode: "NZD",
        stripeKey: "pk_test_refund",
        stripeSecret: "sk_test_placeholder",
        stripeWebhookSecret: secret,
    } as any).setup();
    provider.webhooks = payment.stripe.webhooks;
    payment.stripe = provider;
    (getPaymentMethod as jest.Mock).mockResolvedValue(payment);
    ctx = { subdomain: domain, user, address: "https://school.example" };
});
afterEach(async () => {
    jest.restoreAllMocks();
    for (const model of [
        User,
        Invoice,
        Membership,
        Ledger,
        Receipt,
        RefundRequest,
    ] as any[])
        await model.deleteMany({ domain: domain._id });
    await Domain.deleteOne({ _id: domain._id });
});
it("records pending, partial success, failure and full success while preserving paid receipts and access", async () => {
    const pending = await send("evt_pending");
    expect(await Ledger.findOne({ domain: domain._id }).lean()).toMatchObject(
        await proveRefundCharge(String(domain._id), "test", provider, charge),
    );
    expect(await pending.json()).toEqual({
        message: "Refund status recorded; access unchanged",
    });
    expect(pending.status).toBe(200);
    let view = await readMemberReceipt(ctx, session.metadata.invoiceId);
    expect(view.refundSummary).toMatchObject({
        kind: "observed",
        refundedAmount: 0,
        refunds: [{ amount: 5, status: "pending" }],
    });
    refunds[0].status = "succeeded";
    refunds.push(makeRefund("failed", 600, "re_failed"));
    expect((await send("evt_partial")).status).toBe(200);
    view = await readMemberReceipt(ctx, session.metadata.invoiceId);
    expect(view.refundSummary).toMatchObject({
        refundedAmount: 5,
        refunds: expect.arrayContaining([{ status: "failed", amount: 6 }]),
    });
    refunds.push(makeRefund("succeeded", 600, "re_final"));
    charge.amount_refunded = 1100;
    expect((await send("evt_full", "charge.refunded")).status).toBe(200);
    const original = await Invoice.findOne({ domain: domain._id });
    expect(original).toMatchObject({
        status: "paid",
        amount: 11,
        paymentProcessorTransactionId: "cs_native",
    });
    expect((await Membership.findById(membership._id)).status).toBe("active");
    expect(
        (await readMemberReceipt(ctx, session.metadata.invoiceId))
            .refundSummary,
    ).toMatchObject({ refundedAmount: 11 });
    expect(provider.refunds.create).not.toHaveBeenCalled();
    expect(JSON.stringify(view)).not.toMatch(
        /ch_native|pi_native|cus_native|re_failed/,
    );
});
it("uses current provider status for older events and deduplicates completed event IDs", async () => {
    refunds[0].status = "succeeded";
    expect((await send("evt_old_payload")).status).toBe(200);
    expect((await Ledger.findOne({ domain: domain._id }))!.state).toMatchObject(
        { refunds: [{ status: "succeeded" }] },
    );
    const calls = provider.charges.retrieve.mock.calls.length;
    expect((await send("evt_old_payload")).status).toBe(200);
    expect(provider.charges.retrieve).toHaveBeenCalledTimes(calls);
});
it("proves the initial subscription checkout through its exact invoice and records historical renewals after rejoin", async () => {
    charge.invoice = intent.invoice = session.invoice = invoice.id;
    session.mode = "subscription";
    session.subscription = "sub_native";
    session.payment_intent = null;
    expect((await send("evt_initial_subscription")).status).toBe(200);
    await Ledger.deleteMany({ domain: domain._id });
    await Invoice.updateOne(
        { domain: domain._id },
        { $set: { paymentProcessorTransactionId: invoice.id } },
    );
    invoice.billing_reason = "subscription_cycle";
    await Membership.updateOne(
        { _id: membership._id },
        { $set: { sessionId: "rejoin" } },
    );
    expect((await send("evt_renewal")).status).toBe(200);
    expect(await Ledger.findOne({ domain: domain._id })).toMatchObject({
        membershipSessionId: "original",
    });
    expect((await Membership.findById(membership._id)).sessionId).toBe(
        "rejoin",
    );
});
it("waits for an initial paid callback overtaken by the refund", async () => {
    await Invoice.updateOne(
        { domain: domain._id },
        {
            $set: { status: "pending" },
            $unset: { paymentProcessorTransactionId: 1 },
        },
    );
    expect((await send("evt_overtake")).status).toBe(503);
    expect(await Ledger.countDocuments({ domain: domain._id })).toBe(0);
    await Invoice.updateOne(
        { domain: domain._id },
        { $set: { status: "paid", paymentProcessorTransactionId: session.id } },
    );
    expect((await send("evt_overtake")).status).toBe(200);
});
it("waits for a proved subscription renewal receipt and never substitutes its first invoice", async () => {
    charge.invoice = intent.invoice = invoice.id;
    invoice.billing_reason = "subscription_cycle";
    expect((await send("evt_renewal_overtake")).status).toBe(503);
    expect(await Ledger.countDocuments({ domain: domain._id })).toBe(0);
    await Invoice.create({
        domain: domain._id,
        invoiceId: "renewal",
        membershipId: membership.membershipId,
        membershipSessionId: "original",
        status: "paid",
        amount: 11,
        currencyISOCode: "NZD",
        paymentProcessor: "stripe",
        paymentProcessorTransactionId: invoice.id,
        paymentMode: "test",
    });
    expect((await send("evt_renewal_overtake")).status).toBe(200);
    expect(await Ledger.findOne({ domain: domain._id })).toMatchObject({
        invoiceId: "renewal",
    });
});
it("rejects unsigned, cross-mode, wrong amount and cross-tenant native correlations", async () => {
    expect((await send("evt_unsigned", "refund.updated", false)).status).toBe(
        400,
    );
    expect(provider.charges.retrieve).not.toHaveBeenCalled();
    expect((await send("evt_live", "refund.updated", true, true)).status).toBe(
        400,
    );
    charge.livemode = true;
    expect((await send("evt_provider_live")).status).toBe(202);
    charge.livemode = false;
    session.amount_total = 1200;
    expect((await send("evt_amount")).status).toBe(202);
    session.amount_total = 1100;
    await Invoice.updateOne(
        { domain: domain._id },
        { $set: { domain: new mongoose.Types.ObjectId() } },
    );
    expect((await send("evt_foreign")).status).toBe(202);
    expect(await Ledger.countDocuments({ domain: domain._id })).toBe(0);
});
it("does not take an old stopped claim or let a second worker replace a pending observation", async () => {
    let entered!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const resume = new Promise<void>((resolve) => {
        release = resolve;
    });
    provider.refunds.list.mockImplementationOnce(async () => {
        entered();
        await resume;
        return { data: refunds, has_more: false };
    });
    const first = send("evt_first");
    await reached;
    expect((await send("evt_parallel")).status).toBe(503);
    expect((await Ledger.findOne({ domain: domain._id }))!.state.kind).toBe(
        "bound",
    );
    release();
    expect((await first).status).toBe(200);
    await Ledger.updateOne(
        { domain: domain._id },
        {
            $set: {
                claim: {
                    id: "stopped",
                    eventId: "old",
                    startedAt: new Date("2000-01-01"),
                },
            },
        },
    );
    expect((await send("evt_stopped")).status).toBe(503);
    expect((await Ledger.findOne({ domain: domain._id }))!.claim!.id).toBe(
        "stopped",
    );
});
it("blocks closure for pending/requires-action evidence, then clears only settled money", async () => {
    await send("evt_pending");
    expect(
        (await accountClosureReview(user, ctx)).blockers.map(
            (item) => item.kind,
        ),
    ).toContain("financial");
    refunds[0].status = "requires_action";
    await send("evt_action");
    expect(
        (await accountClosureReview(user, ctx)).blockers.map(
            (item) => item.kind,
        ),
    ).toContain("financial");
    refunds[0].status = "failed";
    await send("evt_failed", "refund.failed");
    expect((await accountClosureReview(user, ctx)).blockers).toEqual([]);
    await User.updateOne({ _id: user._id }, { $set: { active: false } });
    refunds[0].status = "canceled";
    expect((await send("evt_after_erasure")).status).toBe(200);
    expect((await Membership.findById(membership._id)).status).toBe("active");
});
it("projects an exact existing refund status without approving policy-pending submissions or changing access", async () => {
    refunds[0].status = "succeeded";
    await send("evt_money");
    const request = await RefundRequest.create({
        domain: domain._id,
        userId: user.userId,
        requestId: `request-${domain._id}`,
        invoiceId: session.metadata.invoiceId,
        membershipId: membership.membershipId,
        membershipSessionId: "original",
        productName: "Practice",
        reason: "Please review",
        state: "submitted",
        routing: "evidence-review",
        assignedTo: "Al",
        accessDecision: "policy-pending",
        access: "unchanged",
        refund: { kind: "not-started" },
        reviewHash: "x",
        revision: 0,
    });
    const evidence = await Ledger.find({ domain: domain._id }).lean();
    expect(withObservedRefund(request.toObject(), evidence).refund).toEqual({
        kind: "not-started",
    });
    const result = await readMemberRefundRequests(ctx);
    expect(result.products[0].request).toMatchObject({
        state: "submitted",
        consequences: { accessDecision: "policy-pending" },
        refund: { kind: "not-started" },
    });
    expect(result.products[0].refundSummary).toMatchObject({
        refundedAmount: 5,
    });
    const operatorCtx = {
        ...ctx,
        user: { ...user.toObject(), permissions: ["setting:manage"] },
    };
    const operatorView = await readOperatorRefundRequests(operatorCtx);
    expect(operatorView.requests[0]).toMatchObject({
        state: "submitted",
        consequences: { accessDecision: "policy-pending" },
        refundSummary: {
            kind: "observed",
            currency: "nzd",
            refundedAmount: 5,
            refunds: [{ status: "succeeded", amount: 5 }],
        },
    });
    expect(JSON.stringify(operatorView.requests[0].refundSummary)).not.toMatch(
        /ch_native|re_one|pi_native|cus_/,
    );
    await expect(readOperatorRefundRequests(ctx)).rejects.toMatchObject({
        code: "forbidden",
    });
    await expect(
        readOperatorRefundRequests({
            ...operatorCtx,
            memberMimic: { sessionId: "mimic" },
        }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(
        (await accountClosureReview(user, ctx)).blockers.map(
            (item) => item.kind,
        ),
    ).toContain("financial");
});

it("updates only the exact recorded refund's read projection and leaves approved access work pending", async () => {
    refunds[0].status = "succeeded";
    const record = await RefundRequest.create({
        domain: domain._id,
        userId: user.userId,
        requestId: `approved-${domain._id}`,
        invoiceId: session.metadata.invoiceId,
        membershipId: membership.membershipId,
        membershipSessionId: "original",
        productName: "Practice",
        reason: "Approved request",
        state: "approved",
        routing: "purchase-review",
        assignedTo: "Al",
        accessDecision: "end-refunded-access",
        access: "pending",
        quote: { chargeId: charge.id, mode: "test" },
        refund: {
            kind: "result",
            result: {
                kind: "refund",
                refundId: "re_one",
                amount: 500,
                currency: "nzd",
                status: "pending",
            },
        },
        reviewHash: "x",
        revision: 0,
    });
    await send("evt_observed");
    const projected = (await readMemberRefundRequests(ctx)).products[0].request;
    expect(projected).toMatchObject({
        state: "approved",
        access: "pending",
        canReconcile: true,
        refund: { kind: "refund", status: "succeeded" },
    });
    expect((await RefundRequest.findById(record._id))!.refund).toMatchObject({
        result: { status: "pending" },
    });
    await RefundRequest.updateOne(
        { _id: record._id },
        { $set: { "refund.result.refundId": "re_other" } },
    );
    expect(
        (await readMemberRefundRequests(ctx)).products[0].request!.refund,
    ).toMatchObject({ status: "pending" });
    await RefundRequest.updateOne(
        { _id: record._id },
        {
            $set: {
                "refund.result.refundId": "re_one",
                membershipSessionId: "different",
            },
        },
    );
    expect(
        (await readMemberRefundRequests(ctx)).products[0].request!.refund,
    ).toMatchObject({ status: "pending" });
});
async function nativeRefund(status = "pending") {
    return RefundRequest.create({
        domain: domain._id,
        userId: user.userId,
        requestId: `native-${domain._id}`,
        invoiceId: session.metadata.invoiceId,
        membershipId: membership.membershipId,
        membershipSessionId: "original",
        productName: "Practice",
        reason: "Approved request",
        state: "complete",
        routing: "purchase-review",
        assignedTo: "Al",
        accessDecision: "keep-access",
        access: "resolved",
        quote: { chargeId: charge.id, mode: "test" },
        refund: {
            kind: "result",
            observationId: "initial-provider-read",
            result: {
                kind: "refund",
                refundId: "re_one",
                amount: 500,
                currency: "nzd",
                status,
            },
        },
        reviewHash: "x",
        revision: 0,
    });
}
it.each([
    ["succeeded", "failed"],
    ["pending", "succeeded"],
    ["succeeded", "requires_action"],
])(
    "preserves a newer native %s → %s observation across member status, receipt and closure",
    async (older, newer) => {
        const record = await nativeRefund();
        refunds[0].status = older;
        expect((await send("evt_before_native")).status).toBe(200);
        await RefundRequest.updateOne(
            { _id: record._id },
            {
                $set: {
                    "refund.result.status": newer,
                    "refund.observationId": "later-provider-read",
                },
                $inc: { revision: 1 },
            },
        );
        const view = (await readMemberRefundRequests(ctx)).products[0];
        expect(view.request!.refund).toMatchObject({ status: newer });
        expect(view.refundSummary).toMatchObject({
            refunds: [{ status: newer }],
        });
        const operatorView = await readOperatorRefundRequests({
            ...ctx,
            user: { ...user.toObject(), permissions: ["setting:manage"] },
        });
        expect(operatorView.requests[0].refundSummary).toMatchObject({
            refunds: [{ status: newer }],
        });
        expect(
            (await readMemberReceipt(ctx, session.metadata.invoiceId))
                .refundSummary,
        ).toMatchObject({ refunds: [{ status: newer }] });
        const blockers = (await accountClosureReview(user, ctx)).blockers.map(
            (item) => item.kind,
        );
        if (newer === "succeeded") expect(blockers).not.toContain("financial");
        else expect(blockers).toContain("financial");
        // The persisted external observation remains an honest historical provider snapshot.
        expect(
            (await Ledger.findOne({ domain: domain._id }))!.state,
        ).toMatchObject({ refunds: [{ status: older }] });
    },
);
it("does not let non-money revisions or a legacy unproven result supersede an observed pending refund", async () => {
    const record = await nativeRefund("succeeded");
    await send("evt_pending_native");
    await RefundRequest.updateOne(
        { _id: record._id },
        { $set: { reason: "Updated explanation" }, $inc: { revision: 1 } },
    );
    expect(
        (await readMemberRefundRequests(ctx)).products[0].request!.refund,
    ).toMatchObject({ status: "pending" });
    expect(
        (await accountClosureReview(user, ctx)).blockers.map(
            (item) => item.kind,
        ),
    ).toContain("financial");
});
it("retries overlapping native provider work and records only after its claim and result settle", async () => {
    const record = await nativeRefund();
    await RefundRequest.updateOne(
        { _id: record._id },
        { $set: { claim: { id: "stopped-native", expiresAt: new Date(0) } } },
    );
    expect((await send("evt_native_claim")).status).toBe(503);
    expect(provider.refunds.list).not.toHaveBeenCalled();
    await RefundRequest.updateOne(
        { _id: record._id },
        { $unset: { claim: 1 } },
    );
    let entered!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const resume = new Promise<void>((resolve) => {
        release = resolve;
    });
    provider.refunds.list.mockImplementationOnce(async () => {
        entered();
        await resume;
        return { data: refunds, has_more: false };
    });
    const observing = send("evt_native_race");
    await reached;
    await RefundRequest.updateOne(
        { _id: record._id },
        {
            $set: {
                "refund.observationId": "concurrent-provider-read",
                "refund.result.status": "succeeded",
            },
            $inc: { revision: 2 },
        },
    );
    release();
    expect((await observing).status).toBe(503);
    expect((await Ledger.findOne({ domain: domain._id }))!.state.kind).toBe(
        "bound",
    );
    refunds[0].status = "succeeded";
    expect((await send("evt_native_race")).status).toBe(200);
    expect((await accountClosureReview(user, ctx)).blockers).toEqual([]);
});
it("projects the same safe refund summary in Mimic and rejects another member's receipt", async () => {
    await send("evt_safe_summary");
    const ordinary = await readMemberReceipt(ctx, session.metadata.invoiceId);
    const mimicked = await readMemberReceipt(
        { ...ctx, memberMimic: { sessionId: "mimic" } } as any,
        session.metadata.invoiceId,
    );
    expect(mimicked).toEqual({ ...ordinary, readOnly: true });
    await expect(
        readMemberReceipt(
            { ...ctx, user: { ...user.toObject(), userId: "other" } },
            session.metadata.invoiceId,
        ),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
        readMemberReceipt(
            {
                ...ctx,
                subdomain: {
                    ...domain.toObject(),
                    _id: new mongoose.Types.ObjectId(),
                },
            },
            session.metadata.invoiceId,
        ),
    ).rejects.toMatchObject({ code: "unauthorized" });
});
it("reads every refund page and rejects duplicate or over-refunded histories", async () => {
    refunds = Array.from({ length: 101 }, (_, index) =>
        makeRefund("succeeded", 1, `re_${index}`),
    );
    provider.refunds.list.mockImplementation(
        async ({ starting_after }: any) => ({
            data: starting_after ? refunds.slice(100) : refunds.slice(0, 100),
            has_more: !starting_after,
        }),
    );
    expect((await send("evt_pages")).status).toBe(200);
    expect((await Ledger.findOne({ domain: domain._id }))!.state).toMatchObject(
        { refundedAmount: 101 },
    );
    expect(provider.refunds.list).toHaveBeenCalledWith(
        expect.objectContaining({ starting_after: "re_99" }),
    );
    refunds = [
        makeRefund("succeeded", 700),
        makeRefund("succeeded", 500, "re_excess"),
    ];
    expect((await send("evt_excess")).status).toBe(202);
    expect((await Ledger.findOne({ domain: domain._id }))!.state).toMatchObject(
        { refundedAmount: 101 },
    );
});
