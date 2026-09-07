import RefundRequest from "@/models/RefundRequest";
import Booking from "@/models/RefundBookingEvidence";
import Cohort from "@/models/Cohort";
import Invoice from "@/models/Invoice";
import {
    prepareRefundRequest,
    refreshRefundReview,
} from "@/services/refund-requests/review";
import {
    submitRefundRequest,
    decideRefundRequest,
} from "@/services/refund-requests/actions";
import { applyRefundRequest } from "@/services/refund-requests/apply";
import { verifyRefundClassBooking } from "@/services/refund-requests/booking";
import {
    readMemberRefundRequests,
    readOperatorRefundRequests,
} from "@/services/refund-requests/read";
import * as policy from "@/services/refund-requests/policy";
import { fixture, cleanup } from "../../member-billing/__tests__/fixtures";
import type { RefundRequestDependencies } from "@/services/refund-requests/provider";

let f: Awaited<ReturnType<typeof fixture>>,
    deps: RefundRequestDependencies,
    invoiceId: string,
    api: any;
const operator = () => ({
    ...f.ctx,
    user: { ...f.user.toObject(), permissions: ["setting:manage"] },
});
const prepare = () =>
    prepareRefundRequest(
        f.ctx,
        { invoiceId, reason: "Please review my purchase." },
        deps,
    );
const submit = async () => {
    const draft = await prepare();
    return submitRefundRequest(
        f.ctx,
        { requestId: draft.requestId, reviewHash: draft.reviewHash },
        deps,
    );
};
beforeEach(async () => {
    f = await fixture();
    (policy as any).approvedRefundAccessDecision = "policy-pending";
    const native = await Invoice.findOne({ domain: f.domain._id });
    invoiceId = native.invoiceId;
    await Invoice.updateOne(
        { _id: native._id },
        { $set: { paymentProcessorTransactionId: "cs_paid" } },
    );
    f.charge.customer = null;
    f.charge.invoice = null;
    api = {
        ...f.api,
        checkout: {
            sessions: {
                retrieve: jest.fn(async () => ({
                    id: "cs_paid",
                    mode: "payment",
                    status: "complete",
                    payment_status: "paid",
                    payment_intent: "pi_current",
                    customer: null,
                    invoice: null,
                    amount_total: 5000,
                    currency: "nzd",
                    livemode: false,
                    metadata: {
                        invoiceId,
                        membershipId: f.member.membershipId,
                    },
                })),
            },
        },
        paymentIntents: {
            retrieve: jest.fn(async () => ({
                id: "pi_current",
                status: "succeeded",
                amount: 5000,
                amount_received: 5000,
                amount_capturable: 0,
                currency: "nzd",
                livemode: false,
                customer: null,
                invoice: null,
                latest_charge: "ch_current",
            })),
        },
    };
    deps = { now: () => f.now, client: jest.fn(async () => api) };
});
afterEach(async () => {
    jest.restoreAllMocks();
    (policy as any).approvedRefundAccessDecision = "policy-pending";
    await Promise.all([
        RefundRequest.deleteMany({}),
        Booking.deleteMany({}),
        Cohort.deleteMany({}),
    ]);
    await cleanup();
});

it("does not report a lost concurrent reason edit as saved or start provider reads", async () => {
    await prepare();
    const before = await RefundRequest.findOne({ invoiceId }).lean();
    jest.spyOn(RefundRequest, "updateOne").mockResolvedValueOnce({
        modifiedCount: 0,
    } as any);
    jest.mocked(deps.client).mockClear();
    await expect(
        prepareRefundRequest(
            f.ctx,
            { invoiceId, reason: "My newer private note" },
            deps,
        ),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
    expect((await RefundRequest.findOne({ invoiceId }).lean())?.reason).toBe(
        before?.reason,
    );
    expect(deps.client).not.toHaveBeenCalled();
});

it("preserves a draft when provider proof is unavailable and shares it only on submission", async () => {
    api.checkout.sessions.retrieve.mockRejectedValue(
        new Error("private connection error"),
    );
    const draft = await prepare();
    expect(draft).toMatchObject({
        state: "draft",
        quote: null,
        reason: "Please review my purchase.",
    });
    expect((await readOperatorRefundRequests(operator())).requests).toEqual([]);
    expect(
        (await readMemberRefundRequests({ ...f.ctx, memberMimic: {} }))
            .products[0].request,
    ).toBeNull();
    const request = await submitRefundRequest(
        f.ctx,
        { requestId: draft.requestId, reviewHash: draft.reviewHash },
        deps,
    );
    expect(request).toMatchObject({
        state: "submitted",
        assignedTo: "Al",
        notification: {
            kind: "private-review-queue",
            delivery: "not-configured",
        },
    });
    expect(
        (await readOperatorRefundRequests(operator())).requests,
    ).toHaveLength(1);
    expect(JSON.stringify(request)).not.toMatch(
        /private connection|pi_current|ch_current|cs_paid/,
    );
});
it("routes a purchase to human review and records KK escalation and explanation", async () => {
    const request = await submit();
    expect(request.routing).toBe("purchase-review");
    const escalated = await decideRefundRequest(
        operator(),
        {
            action: "escalate",
            requestId: request.requestId,
            reviewHash: request.reviewHash,
            explanation: "KK should review the course circumstances.",
        },
        deps,
    );
    expect(escalated.assignedTo).toBe("KK");
    const saved = await RefundRequest.findOne().lean();
    expect(saved?.escalation).toMatchObject({
        actorUserId: f.user.userId,
        explanation: "KK should review the course circumstances.",
    });
    expect(api.refunds.create).not.toHaveBeenCalled();
});
it("does not infer a paid class booking from a single cohort roster match", async () => {
    await Cohort.create({
        domain: f.domain._id,
        cohortId: "class",
        name: "Class",
        courseId: "course",
        members: [f.user.userId],
        schedule: { startAt: new Date(f.now.getTime() + 30 * 86400000) },
    });
    expect((await submit()).routing).toBe("purchase-review");
    expect(await Booking.countDocuments()).toBe(0);
    expect(api.refunds.create).not.toHaveBeenCalled();
});
it.each([14 * 86400000, 14 * 86400000 - 1])(
    "uses explicit booking evidence at the exact %d ms boundary",
    async (offset) => {
        await Cohort.create({
            domain: f.domain._id,
            cohortId: "class",
            name: "Class",
            courseId: "course",
            members: [f.user.userId],
            schedule: { startAt: new Date(f.now.getTime() + offset) },
        });
        await verifyRefundClassBooking(operator(), {
            invoiceId,
            cohortId: "class",
            explanation: "Receipt and actual enrolment checked together.",
            bookingVerified: true,
        });
        const request = await submit();
        expect(request.routing).toBe(
            offset === 14 * 86400000 ? "class-automatic" : "class-review",
        );
        // Actual access policy is still pending; eligibility alone never sends money.
        expect(request.state).toBe("submitted");
        expect(api.refunds.create).not.toHaveBeenCalled();
    },
);
it("requires operator authority and a real dated booking, and preserves verification history", async () => {
    await Cohort.create({
        domain: f.domain._id,
        cohortId: "undated",
        name: "Undated",
        courseId: "course",
        members: [f.user.userId],
    });
    const args = {
        invoiceId,
        cohortId: "undated",
        explanation: "Checked",
        bookingVerified: true as const,
    };
    await expect(verifyRefundClassBooking(f.ctx, args)).rejects.toThrow(
        "permission",
    );
    await expect(verifyRefundClassBooking(operator(), args)).rejects.toThrow(
        "no verified start",
    );
    await Cohort.updateOne(
        { cohortId: "undated" },
        {
            $set: {
                schedule: {
                    startAt: new Date(f.now.getTime() + 30 * 86400000),
                },
            },
        },
    );
    await verifyRefundClassBooking(operator(), args);
    await verifyRefundClassBooking(operator(), {
        ...args,
        explanation: "Rechecked the original booking.",
    });
    expect((await Booking.findOne().lean())?.verifications).toHaveLength(2);
});
it("invalidates reviewed consequences when the verified class schedule changes", async () => {
    await Cohort.create({
        domain: f.domain._id,
        cohortId: "class",
        name: "Class",
        courseId: "course",
        members: [f.user.userId],
        schedule: { startAt: new Date(f.now.getTime() + 30 * 86400000) },
    });
    await verifyRefundClassBooking(operator(), {
        invoiceId,
        cohortId: "class",
        explanation: "Checked",
        bookingVerified: true,
    });
    const draft = await prepare();
    await Cohort.updateOne(
        { cohortId: "class" },
        {
            $set: {
                "schedule.startAt": new Date(f.now.getTime() + 2 * 86400000),
            },
        },
    );
    await expect(
        submitRefundRequest(
            f.ctx,
            { requestId: draft.requestId, reviewHash: draft.reviewHash },
            deps,
        ),
    ).rejects.toThrow("booking changed");
    expect(api.refunds.create).not.toHaveBeenCalled();
});
it("refuses approval while access policy is pending, preserving a submitted request", async () => {
    const request = await submit();
    await expect(
        decideRefundRequest(
            operator(),
            {
                action: "approve",
                requestId: request.requestId,
                reviewHash: request.reviewHash,
                explanation: "Approved",
            },
            deps,
        ),
    ).rejects.toThrow("consequence review");
    expect((await RefundRequest.findOne().lean())?.state).toBe("submitted");
    expect(api.refunds.create).not.toHaveBeenCalled();
});
it("a reviewed fixture policy exercises approval and uncertain recovery without duplicate funds", async () => {
    // Isolated engine fixture only; production remains policy-pending until Al decides.
    (policy as any).approvedRefundAccessDecision = "preserve-access";
    const request = await submit();
    api.refunds.create.mockRejectedValueOnce(new Error("provider timeout"));
    const approved = await decideRefundRequest(
        operator(),
        {
            action: "approve",
            requestId: request.requestId,
            reviewHash: request.reviewHash,
            explanation: "Approved full remaining amount with access kept.",
        },
        deps,
    );
    expect(approved).toMatchObject({
        state: "approved",
        access: "pending",
        refund: { kind: "uncertain" },
    });
    await applyRefundRequest(f.ctx, request.requestId, false, deps);
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
});
it("keeps cross-member, cross-tenant and Mimic requests out of mutation paths", async () => {
    await expect(
        prepareRefundRequest(
            { ...f.ctx, user: { ...f.user.toObject(), userId: "other" } },
            { invoiceId, reason: "Other" },
            deps,
        ),
    ).rejects.toThrow("not found");
    await expect(
        prepareRefundRequest(
            { ...f.ctx, memberMimic: {} },
            { invoiceId, reason: "Mimic" },
            deps,
        ),
    ).rejects.toThrow("Exit Member Mimic");
    await expect(
        prepareRefundRequest(
            { ...f.ctx, subdomain: { _id: "other" } },
            { invoiceId, reason: "Other" },
            deps,
        ),
    ).rejects.toThrow("Sign in");
    expect(await RefundRequest.countDocuments()).toBe(0);
});

it("concurrent confirmations apply the reviewed refund once and preserve unrelated access", async () => {
    (policy as any).approvedRefundAccessDecision = "preserve-access";
    const request = await submit();
    const input = {
        action: "approve" as const,
        requestId: request.requestId,
        reviewHash: request.reviewHash,
        explanation: "Reviewed full remaining payment and preserved access.",
    };
    const results = await Promise.allSettled([
        decideRefundRequest(operator(), input, deps),
        decideRefundRequest(operator(), input, deps),
    ]);
    expect(
        results.filter((result) => result.status === "fulfilled").length,
    ).toBeGreaterThanOrEqual(1);
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
    expect(await RefundRequest.countDocuments()).toBe(1);
    expect((await RefundRequest.findOne().lean())?.state).toBe("complete");
    expect(f.sub.status).toBe("active");
    expect(f.user.purchases).toHaveLength(1);
    await Promise.all([
        applyRefundRequest(f.ctx, request.requestId, false, deps),
        applyRefundRequest(f.ctx, request.requestId, false, deps),
    ]);
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
});
it("a durable claim with no known provider result is reconciled without ever creating again", async () => {
    (policy as any).approvedRefundAccessDecision = "preserve-access";
    const request = await submit();
    // Simulates a crash immediately after first-attempt persistence, before any provider call.
    await RefundRequest.updateOne(
        { requestId: request.requestId },
        {
            $set: {
                state: "approved",
                access: "pending",
                refund: { kind: "claimed", firstAttemptAt: f.now },
            },
        },
    );
    const result = await applyRefundRequest(
        f.ctx,
        request.requestId,
        false,
        deps,
    );
    expect(result.refund.kind).toBe("uncertain");
    expect(api.refunds.create).not.toHaveBeenCalled();
    expect((await RefundRequest.findOne().lean())?.refund.kind).toBe("result");
});
it("recovers a provider-accepted refund after its database result was lost", async () => {
    (policy as any).approvedRefundAccessDecision = "preserve-access";
    const request = await submit();
    const native = await RefundRequest.findOne().lean();
    const quote = native!.quote!;
    f.refunds.push({
        id: "re_lost",
        charge: quote.chargeId,
        amount: quote.refundableAmount,
        currency: quote.currency,
        status: "succeeded",
        metadata: {
            kk_purchase_refund: request.requestId,
            kk_purchase_quote: quote.hash,
        },
    });
    f.charge.amount_refunded = quote.refundableAmount;
    await RefundRequest.updateOne(
        { requestId: request.requestId },
        {
            $set: {
                state: "approved",
                access: "pending",
                refund: { kind: "claimed", firstAttemptAt: f.now },
            },
        },
    );
    const result = await applyRefundRequest(
        f.ctx,
        request.requestId,
        false,
        deps,
    );
    expect(result).toMatchObject({
        state: "complete",
        access: "resolved",
        refund: { kind: "refund", status: "succeeded" },
    });
    expect(api.refunds.create).not.toHaveBeenCalled();
});
it("will not apply a reviewed payment whose native mode or transaction changed", async () => {
    (policy as any).approvedRefundAccessDecision = "preserve-access";
    const request = await submit();
    await Invoice.updateOne({ invoiceId }, { $set: { paymentMode: "live" } });
    await expect(
        decideRefundRequest(
            operator(),
            {
                action: "approve",
                requestId: request.requestId,
                reviewHash: request.reviewHash,
                explanation: "Approved",
            },
            deps,
        ),
    ).rejects.toThrow("payment record changed");
    expect(api.refunds.create).not.toHaveBeenCalled();
    expect((await RefundRequest.findOne().lean())?.refund.kind).toBe(
        "not-started",
    );
});
it("requires a new consequence review if policy changes while the member's draft is open", async () => {
    const draft = await prepare();
    (policy as any).approvedRefundAccessDecision = "preserve-access";
    await expect(
        submitRefundRequest(
            f.ctx,
            { requestId: draft.requestId, reviewHash: draft.reviewHash },
            deps,
        ),
    ).rejects.toThrow("access policy changed");
    expect((await RefundRequest.findOne().lean())?.state).toBe("draft");
    expect(api.refunds.create).not.toHaveBeenCalled();
});
it("automatically refunds an explicitly verified class at fourteen days when its access policy is approved", async () => {
    (policy as any).approvedRefundAccessDecision = "preserve-access";
    await Cohort.create({
        domain: f.domain._id,
        cohortId: "class",
        name: "Class",
        courseId: "course",
        members: [f.user.userId],
        schedule: { startAt: new Date(f.now.getTime() + 14 * 86400000) },
    });
    await verifyRefundClassBooking(operator(), {
        invoiceId,
        cohortId: "class",
        explanation: "Original receipt and booking checked together.",
        bookingVerified: true,
    });
    const result = await submit();
    expect(result).toMatchObject({
        routing: "class-automatic",
        state: "complete",
        refund: { kind: "refund", status: "succeeded" },
    });
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
    expect(api.refunds.create.mock.calls[0][0].amount).toBe(5000);
    expect((await RefundRequest.findOne().lean())?.decision).toMatchObject({
        policy: "class-at-least-14-days",
        actorUserId: "policy:class-14-days",
    });
    expect(f.sub.status).toBe("active");
});
it("an expired approval with no provider attempt can be reviewed again with its prior decision preserved", async () => {
    (policy as any).approvedRefundAccessDecision = "preserve-access";
    const request = await submit();
    const approved = {
        kind: "approved",
        policy: request.routing,
        actorUserId: f.user.userId,
        explanation: "Earlier approval",
        at: f.now,
        reviewHash: request.reviewHash,
    };
    await RefundRequest.updateOne(
        { requestId: request.requestId },
        {
            $set: {
                state: "approved",
                access: "pending",
                quoteExpiresAt: new Date(f.now.getTime() - 1),
                decision: approved,
            },
            $push: { decisionHistory: approved },
        },
    );
    await expect(
        applyRefundRequest(f.ctx, request.requestId, false, deps),
    ).rejects.toThrow("expired");
    expect((await RefundRequest.findOne().lean())?.state).toBe(
        "review-required",
    );
    expect(api.refunds.create).not.toHaveBeenCalled();
    const reviewed = await refreshRefundReview(
        operator(),
        request.requestId,
        true,
        deps,
    );
    const completed = await decideRefundRequest(
        operator(),
        {
            action: "approve",
            requestId: reviewed.requestId,
            reviewHash: reviewed.reviewHash,
            explanation: "Refreshed payment and consequence reviewed.",
        },
        deps,
    );
    expect(completed.state).toBe("complete");
    expect(
        (await RefundRequest.findOne().lean())?.decisionHistory,
    ).toHaveLength(2);
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
});
