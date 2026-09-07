import { fixture, cleanup } from "../../member-billing/__tests__/fixtures";
import {
    InvoiceModel as Invoice,
    MembershipModel as Membership,
} from "@/services/member-billing/models";
import RefundRequest from "@/models/RefundRequest";
import Booking from "@/models/RefundBookingEvidence";
import Cohort from "@/models/Cohort";
import User from "@/models/User";
import { verifyRefundClassBooking } from "@/services/refund-requests/booking";
import {
    AccessCourseModel,
    AccessUserModel,
    MembershipAccessModel,
} from "../../../../../../packages/common-logic/src/member-access/models";
import { claimDelivery } from "../../../../../../packages/common-logic/src/member-access/drip";
import {
    prepareRefundRequest,
    refreshRefundReview,
} from "@/services/refund-requests/review";
import {
    submitRefundRequest,
    decideRefundRequest,
} from "@/services/refund-requests/actions";
import { applyRefundRequest } from "@/services/refund-requests/apply";
import { reconcilePurchaseRefundAccess } from "@/services/refund-requests/access-evidence";
import { PurchaseAccessModel } from "../../../../../../packages/common-logic/src/purchase-access/model";
import { withPurchaseAccessWrite } from "../../../../../../packages/common-logic/src/purchase-access/gate";
import { endFullyRefundedPurchase } from "../../../../../../packages/common-logic/src/purchase-access/end";
import { ensureMembershipAccess } from "@/services/member-access";
import { getLessonAccess } from "../../../../../../packages/common-logic/src/member-access/read";
import { deleteUserMemberAccess } from "../../../../../../packages/common-logic/src/member-access/cleanup";
import { activateMembership } from "../../payment/helpers";
import { readMemberReceipt } from "@/services/member-receipts/read";
import { readOperatorRefundRequests } from "@/services/refund-requests/read";

let f: Awaited<ReturnType<typeof fixture>>, api: any, invoiceId: string;
const operator = () => ({
    ...f.ctx,
    user: { ...f.user.toObject(), permissions: ["setting:manage"] },
});
const deps = () => ({ now: () => f.now, client: async () => api });
const access = () => getLessonAccess({ ...f.key, lessonId: "drop" });
const fullProof = () => ({
    invoiceId,
    chargeId: "ch_current",
    mode: "test" as const,
    paidAmount: 5000,
    currency: "nzd",
    refundIds: ["re_full"],
    observedAt: new Date(),
});
async function submitted() {
    const draft = await prepareRefundRequest(
        f.ctx,
        { invoiceId, reason: "Please review this purchase." },
        deps(),
    );
    return submitRefundRequest(
        f.ctx,
        { requestId: draft.requestId, reviewHash: draft.reviewHash },
        deps(),
    );
}
async function approve(request: { requestId: string; reviewHash: string }) {
    return decideRefundRequest(
        operator(),
        {
            action: "approve",
            ...request,
            explanation: "Approve the exact reviewed amount and consequence.",
        },
        deps(),
    );
}
beforeEach(async () => {
    f = await fixture();
    const invoice = await Invoice.findOne({ domain: f.domain._id }).lean();
    invoiceId = invoice!.invoiceId;
    await Invoice.updateOne(
        { _id: invoice!._id },
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
    api.refunds.create.mockImplementation(async (body: any) => {
        const refund = {
            id: `re_${f.refunds.length + 1}`,
            charge: f.charge.id,
            amount: body.amount,
            currency: "nzd",
            status: "succeeded",
            metadata: body.metadata,
        };
        f.refunds.push(refund);
        f.charge.amount_refunded += body.amount;
        return refund;
    });
});
afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([
        PurchaseAccessModel.deleteMany({}),
        RefundRequest.deleteMany({}),
        Booking.deleteMany({}),
        Cohort.deleteMany({}),
    ]);
    await cleanup();
});

it("approves a partial amount, preserves access, then separately reviews and approves the remaining payment with new operation identity", async () => {
    const before = await Invoice.findOne({ invoiceId }).lean();
    const request = await submitted();
    const partial = await refreshRefundReview(
        operator(),
        request.requestId,
        true,
        deps(),
        { amount: 1000 },
    );
    expect(partial.quote?.amount).toBe(1000);
    expect(partial.consequences.explanation).toMatch(/partial refund keeps/);
    await expect(approve(request)).rejects.toThrow(/changed/);
    expect(api.refunds.create).not.toHaveBeenCalled();
    const first = await approve(partial);
    expect(first).toMatchObject({ state: "complete", access: "resolved" });
    await applyRefundRequest(f.ctx, request.requestId, false, deps());
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
    expect(await access()).toMatchObject({ kind: "allowed" });
    const next = await refreshRefundReview(
        operator(),
        request.requestId,
        true,
        deps(),
        { newAttempt: true, reviewHash: first.reviewHash },
    );
    expect(next.quote?.amount).toBe(4000);
    await expect(
        refreshRefundReview(operator(), request.requestId, true, deps(), {
            newAttempt: true,
            reviewHash: first.reviewHash,
        }),
    ).rejects.toThrow(/completed request/);
    expect((await approve(next)).state).toBe("complete");
    expect(await access()).toMatchObject({
        kind: "denied",
        reason: "purchase-refunded",
    });
    expect(api.refunds.create).toHaveBeenCalledTimes(2);
    const [one, two] = api.refunds.create.mock.calls;
    expect(one[1].idempotencyKey).not.toBe(two[1].idempotencyKey);
    expect(
        (await RefundRequest.findOne({ invoiceId }).lean())?.priorAttempts,
    ).toHaveLength(1);
    expect(await Invoice.findOne({ invoiceId }).lean()).toEqual(before);
});

it("recovers the same provider-created full refund after a lost response without another money operation", async () => {
    const request = await submitted();
    const create = api.refunds.create.getMockImplementation();
    api.refunds.create.mockImplementationOnce(async (...args: any[]) => {
        await create(...args);
        throw new Error("lost response");
    });
    expect(await approve(request)).toMatchObject({
        refund: { kind: "uncertain" },
        access: "pending",
    });
    expect(await access()).toMatchObject({ kind: "allowed" });
    const recovered = await applyRefundRequest(
        f.ctx,
        request.requestId,
        false,
        deps(),
    );
    expect(recovered).toMatchObject({
        state: "complete",
        refund: { kind: "refund", status: "succeeded" },
    });
    expect(await access()).toMatchObject({ kind: "denied" });
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
});

it("preserves an ambiguous second paid order sharing the same legacy membership session", async () => {
    await Invoice.create({
        domain: f.domain._id,
        invoiceId: "second-paid",
        membershipId: f.member.membershipId,
        membershipSessionId: f.member.sessionId,
        status: "paid",
        paymentProcessor: "stripe",
        paymentProcessorTransactionId: "cs_second",
        amount: 12,
        currencyISOCode: "NZD",
        paymentMode: "test",
    });
    f.refunds.push({
        id: "re_full",
        charge: "ch_current",
        amount: 5000,
        currency: "nzd",
        status: "succeeded",
    });
    f.charge.amount_refunded = 5000;
    expect(
        await reconcilePurchaseRefundAccess(f.key.domainId, invoiceId, api),
    ).toBe("review-required");
    expect(await access()).toMatchObject({ kind: "allowed" });
    expect(
        await PurchaseAccessModel.countDocuments({ state: { $ne: "open" } }),
    ).toBe(0);
    const request = await submitted();
    expect(request.quote).toBeNull();
    expect(request.canApprove).toBe(false);
    await expect(approve(request)).rejects.toThrow(/review/);
    expect(api.refunds.create).not.toHaveBeenCalled();
});

it("cleans access facts through the existing account erasure fence without deleting financial evidence or another account’s facts", async () => {
    await endFullyRefundedPurchase(f.key, fullProof(), async () => false);
    await PurchaseAccessModel.create({
        domain: f.domain._id,
        userId: "other",
        courseId: "course",
        membershipId: "other-membership",
        membershipSessionId: "other-session",
        state: "open",
        writes: [],
        updatedAt: new Date(),
    });
    await deleteUserMemberAccess(f.key.domainId, f.key.userId);
    expect(
        await PurchaseAccessModel.countDocuments({ userId: f.key.userId }),
    ).toBe(0);
    expect(await PurchaseAccessModel.countDocuments({ userId: "other" })).toBe(
        1,
    );
    expect(await Invoice.countDocuments({ invoiceId, status: "paid" })).toBe(1);
});

it("fences an admitted late activation, denies reads immediately, preserves a newer rejoin, and never re-runs terminal cleanup", async () => {
    let resume!: () => void, admitted!: () => void;
    const ready = new Promise<void>((resolve) => {
        admitted = resolve;
    });
    const writer = withPurchaseAccessWrite(f.key, async () => {
        admitted();
        await new Promise<void>((resolve) => {
            resume = resolve;
        });
        await Membership.updateOne(
            { membershipId: f.member.membershipId },
            { $set: { status: "active" } },
        );
    });
    await ready;
    const booking = jest.fn(async () => false);
    expect(await endFullyRefundedPurchase(f.key, fullProof(), booking)).toBe(
        "pending",
    );
    expect(await access()).toMatchObject({ kind: "denied" });
    await expect(
        withPurchaseAccessWrite(f.key, async () => {}),
    ).rejects.toThrow(/fully refunded/);
    resume();
    await writer;
    expect(await endFullyRefundedPurchase(f.key, fullProof(), booking)).toBe(
        "ended",
    );
    await Membership.updateOne(
        { membershipId: f.member.membershipId },
        {
            $set: {
                status: "active",
                sessionId: "rejoin",
                accessActivation: {
                    sessionId: "rejoin",
                    startedAt: new Date(),
                },
            },
        },
    );
    const rejoin = await Membership.findOne({
        membershipId: f.member.membershipId,
    });
    await ensureMembershipAccess({
        domainId: f.key.domainId,
        membership: rejoin!,
    });
    expect(await endFullyRefundedPurchase(f.key, fullProof(), booking)).toBe(
        "ended",
    );
    expect(booking).toHaveBeenCalledTimes(1);
    expect(await access()).toMatchObject({ kind: "allowed" });
    await activateMembership(f.domain, f.member, null);
    expect(
        (await Membership.findOne({ membershipId: f.member.membershipId }))
            ?.sessionId,
    ).toBe("rejoin");
});

it("does not revoke legacy active access or backfill missing receipt mode during reads; verified external mode can prove an actual full refund", async () => {
    await Invoice.updateOne(
        { invoiceId },
        { $unset: { paymentMode: 1, settlement: 1 } },
    );
    const before = await Invoice.findOne({ invoiceId }).lean();
    expect(await access()).toMatchObject({ kind: "allowed" });
    expect(
        await PurchaseAccessModel.countDocuments({ state: { $ne: "open" } }),
    ).toBe(0);
    await expect(
        reconcilePurchaseRefundAccess(f.key.domainId, invoiceId, api),
    ).rejects.toThrow(/mode-unavailable/);
    f.refunds.push({
        id: "re_full",
        charge: "ch_current",
        amount: 5000,
        currency: "nzd",
        status: "succeeded",
    });
    f.charge.amount_refunded = 5000;
    expect(
        await reconcilePurchaseRefundAccess(
            f.key.domainId,
            invoiceId,
            api,
            "test",
        ),
    ).toBe("ended");
    expect(await Invoice.findOne({ invoiceId }).lean()).toEqual(before);
});

it("keeps partial/pending refunds unchanged and marks a returned full refund for recovery without restoring access", async () => {
    f.refunds.push(
        {
            id: "re_part",
            charge: "ch_current",
            amount: 1000,
            currency: "nzd",
            status: "succeeded",
        },
        {
            id: "re_rest",
            charge: "ch_current",
            amount: 4000,
            currency: "nzd",
            status: "pending",
        },
    );
    f.charge.amount_refunded = 1000;
    expect(
        await reconcilePurchaseRefundAccess(f.key.domainId, invoiceId, api),
    ).toBe("unchanged");
    expect(await access()).toMatchObject({ kind: "allowed" });
    f.refunds[1].status = "succeeded";
    f.charge.amount_refunded = 5000;
    expect(
        await reconcilePurchaseRefundAccess(f.key.domainId, invoiceId, api),
    ).toBe("ended");
    f.refunds[1].status = "failed";
    f.charge.amount_refunded = 1000;
    expect(
        await reconcilePurchaseRefundAccess(f.key.domainId, invoiceId, api),
    ).toBe("review-required");
    expect(await access()).toMatchObject({ kind: "denied" });
    expect(
        (
            await PurchaseAccessModel.findOne({
                "proof.invoiceId": invoiceId,
            }).lean()
        )?.financialReviewRequired,
    ).toBe(true);
});

it("stops a delivery paused immediately before its final claim when full refund caps the same period", async () => {
    await AccessCourseModel.updateOne(
        { domain: f.domain._id, courseId: "course" },
        { $set: { "groups.0.drip.email.published": true } },
    );
    await MembershipAccessModel.updateOne(
        { domain: f.domain._id },
        {
            $set: {
                deliveries: [
                    {
                        id: "delivery",
                        groupId: "open",
                        createdAt: new Date(),
                        state: { kind: "pending" },
                    },
                ],
            },
        },
    );
    const period = await MembershipAccessModel.findOne({
        domain: f.domain._id,
    }).lean();
    const original = AccessCourseModel.exists.bind(AccessCourseModel);
    let resume!: () => void, reached!: () => void;
    const ready = new Promise<void>((resolve) => {
        reached = resolve;
    });
    jest.spyOn(AccessCourseModel, "exists").mockImplementation(((
        filter: any,
    ) => {
        if (!filter.groups) return original(filter);
        return (async () => {
            reached();
            await new Promise<void>((resolve) => {
                resume = resolve;
            });
            return original(filter);
        })();
    }) as any);
    const delivery = claimDelivery(f.key.domainId, period!.id, "delivery");
    await ready;
    expect(
        await endFullyRefundedPurchase(f.key, fullProof(), async () => false),
    ).toBe("ended");
    resume();
    expect(await delivery).toEqual({ kind: "skipped" });
    expect(
        (await MembershipAccessModel.findOne({ domain: f.domain._id }).lean())
            ?.deliveries[0].state.kind,
    ).toBe("cancelled");
});

it("automatically refunds a qualifying class but preserves ambiguous shared roster/tag entries and immutable booking audit", async () => {
    const cohort = await Cohort.create({
        domain: f.domain._id,
        cohortId: "class",
        courseId: "course",
        name: "Dated class",
        members: [f.user.userId],
        schedule: { startAt: new Date(f.now.getTime() + 30 * 86400000) },
    });
    await User.updateOne(
        { _id: f.user._id },
        { $set: { tags: ["cohort:class"] } },
    );
    await verifyRefundClassBooking(operator(), {
        invoiceId,
        cohortId: "class",
        explanation: "Verified the original paid booking.",
        bookingVerified: true,
    });
    const before = await Booking.findOne({ invoiceId }).lean();
    const result = await submitted();
    expect(result).toMatchObject({
        state: "complete",
        access: "ended-booking-review",
        refund: { kind: "refund", status: "succeeded" },
    });
    expect(await access()).toMatchObject({ kind: "denied" });
    expect((await Cohort.findById(cohort._id).lean())?.members).toEqual([
        f.user.userId,
    ]);
    expect((await AccessUserModel.findById(f.user._id).lean())?.tags).toEqual([
        "cohort:class",
    ]);
    expect(await Booking.findOne({ invoiceId }).lean()).toEqual(before);
    expect((await readMemberReceipt(f.ctx, invoiceId)).refundSummary).toEqual({
        kind: "unrecorded",
        purchaseAccess: "ended-booking-review",
    });
    expect(
        (await readOperatorRefundRequests(operator())).requests[0]
            .refundSummary,
    ).toEqual({ kind: "unrecorded", purchaseAccess: "ended-booking-review" });
});

it("serializes an external full observation against a later native returned-refund observation", async () => {
    const request = await submitted();
    const create = api.refunds.create.getMockImplementation();
    api.refunds.create.mockImplementationOnce(async (...args: any[]) => {
        const result = await create(...args);
        result.status = "pending";
        return result;
    });
    expect(await approve(request)).toMatchObject({
        state: "approved",
        refund: { kind: "refund", status: "pending" },
    });
    f.refunds[0].status = "succeeded";
    let resume!: () => void, reached!: () => void;
    const ready = new Promise<void>((resolve) => {
        reached = resolve;
    });
    const original = Invoice.exists.bind(Invoice);
    jest.spyOn(Invoice, "exists").mockImplementationOnce(((filter: any) =>
        (async () => {
            reached();
            await new Promise<void>((resolve) => {
                resume = resolve;
            });
            return original(filter);
        })()) as any);
    const external = reconcilePurchaseRefundAccess(
        f.key.domainId,
        invoiceId,
        api,
    );
    await ready;
    f.refunds[0].status = "failed";
    f.charge.amount_refunded = 0;
    await expect(
        applyRefundRequest(f.ctx, request.requestId, false, deps()),
    ).rejects.toThrow(/being checked/);
    expect(
        (await RefundRequest.findOne({ invoiceId }).lean())?.refund,
    ).toMatchObject({ kind: "result", result: { status: "pending" } });
    resume();
    expect(await external).toBe("ended");
    expect(
        await applyRefundRequest(f.ctx, request.requestId, false, deps()),
    ).toMatchObject({
        access: "review-required",
        refund: { kind: "refund", status: "failed" },
    });
    expect((await readMemberReceipt(f.ctx, invoiceId)).refundSummary).toEqual({
        kind: "unrecorded",
        purchaseAccess: "recovery-required",
    });
    expect(
        (await readOperatorRefundRequests(operator())).requests[0]
            .refundSummary,
    ).toEqual({ kind: "unrecorded", purchaseAccess: "recovery-required" });
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
});

it("refuses unsupported access association and a late second order before the first provider call", async () => {
    const request = await submitted();
    await Invoice.create({
        domain: f.domain._id,
        invoiceId: "late-order",
        paymentProcessor: "stripe",
        membershipId: f.member.membershipId,
        membershipSessionId: f.member.sessionId,
        status: "pending",
        amount: 12,
        currencyISOCode: "NZD",
    });
    await expect(approve(request)).rejects.toThrow(/association needs review/);
    expect(api.refunds.create).not.toHaveBeenCalled();
    await Invoice.deleteOne({ invoiceId: "late-order" });
    await Membership.updateOne(
        { _id: f.member._id },
        { $set: { isIncludedInPlan: true } },
    );
    const refreshed = await refreshRefundReview(
        operator(),
        request.requestId,
        true,
        deps(),
    );
    expect(refreshed.quote).toBeNull();
    expect(refreshed.canApprove).toBe(false);
});

it("rejects wrong original payment association and wrong mode without recording an access end", async () => {
    api.checkout.sessions.retrieve.mockResolvedValueOnce({
        ...(await api.checkout.sessions.retrieve()),
        metadata: { invoiceId: "foreign", membershipId: f.member.membershipId },
    });
    // The first lookup is followed by a fresh proof; contradict both reads.
    const wrong = {
        ...(await api.checkout.sessions.retrieve()),
        metadata: { invoiceId: "foreign", membershipId: f.member.membershipId },
    };
    api.checkout.sessions.retrieve.mockResolvedValue(wrong);
    await expect(
        reconcilePurchaseRefundAccess(f.key.domainId, invoiceId, api),
    ).rejects.toThrow(/mismatch/);
    await expect(
        reconcilePurchaseRefundAccess(f.key.domainId, invoiceId, api, "live"),
    ).rejects.toThrow(/mode-unavailable/);
    expect(
        await PurchaseAccessModel.countDocuments({ state: { $ne: "open" } }),
    ).toBe(0);
    expect(await access()).toMatchObject({ kind: "allowed" });
});
