import { prepareMemberCancellation } from "@/services/member-billing/prepare";
import { advanceMemberCancellation } from "@/services/member-billing/advance";
import { readMemberBilling } from "@/services/member-billing/read";
import BillingCancellation from "@/models/BillingCancellation";
import Membership from "@/models/Membership";
import Invoice from "@/models/Invoice";
import User from "@/models/User";
import PaymentPlan from "@/models/PaymentPlan";
import Lesson from "@/models/Lesson";
import * as retention from "@/services/member-billing/retention";
import {
    getLessonAccess,
    ensureMembershipAccess,
} from "@/services/member-access";
import { MembershipAccessModel as Access } from "../../../../../../packages/common-logic/src/member-access/models";
import type { BillingCancellationView } from "@/services/member-billing/types";
import { fixture, cleanup } from "./fixtures";

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
    f = await fixture();
});
afterEach(cleanup);
async function prepare(): Promise<BillingCancellationView> {
    const result = await prepareMemberCancellation(
        f.ctx,
        f.member.membershipId,
        f.deps,
    );
    if (result.kind !== "operation") throw new Error(JSON.stringify(result));
    return result.operation;
}
const advance = (
    op: BillingCancellationView,
    action: "confirm" | "reconcile" = "confirm",
) =>
    advanceMemberCancellation(
        f.ctx,
        { action, operationId: op.operationId, quoteHash: op.quote.hash },
        f.deps,
    );

it("GET includes owned historical receipts after rejoin, omits provider data and never initializes access", async () => {
    await Access.deleteMany({});
    await Invoice.create({
        domain: f.domain._id,
        invoiceId: "other-session",
        membershipId: f.member.membershipId,
        membershipSessionId: "old",
        amount: 999,
        status: "paid",
        paymentProcessor: "stripe",
        currencyISOCode: "USD",
    });
    const view = await readMemberBilling(f.ctx);
    expect(view.memberships[0]).toMatchObject({
        productName: "Practice library",
        consequences: { kind: "partly-unknown", unknownCourseCount: 1 },
    });
    expect(view.memberships[0].invoices).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                amount: 50,
                currency: "NZD",
                mode: "test",
                receipt: { kind: "unavailable" },
            }),
            expect.objectContaining({
                invoiceId: "other-session",
                amount: 999,
                currency: "USD",
                mode: "unknown",
            }),
        ]),
    );
    expect(view.memberships[0].invoices).toHaveLength(2);
    expect(JSON.stringify(view)).not.toMatch(
        /sub_monthly|cus_member|ch_current|in_current|stripeSecret/,
    );
    expect(await Access.countDocuments()).toBe(0);
    expect(f.api.subscriptions.retrieve).not.toHaveBeenCalled();
});
it("prepare persists a review without freezing access or creating any refund", async () => {
    const before = await Access.findOne().lean();
    const op = await prepare();
    expect(op).toMatchObject({
        phase: "quoted",
        access: "unchanged",
        quote: {
            refundAmount: 5000,
            currency: "nzd",
            mode: "test",
            consequences: { retainedCount: 1 },
        },
    });
    expect(await Access.findOne().lean()).toEqual(before);
    expect(await BillingCancellation.countDocuments()).toBe(1);
    expect(f.api.subscriptions.cancel).not.toHaveBeenCalled();
    expect(f.api.refunds.create).not.toHaveBeenCalled();
});
it("persistence key reordering in retention targets does not invalidate an unchanged review", async () => {
    const op = await prepare();
    const saved = await BillingCancellation.findOne().lean();
    const reordered = saved!.targets.map((target) =>
        Object.fromEntries(Object.entries(target).reverse()),
    );
    await BillingCancellation.updateOne(
        { operationId: op.operationId },
        { $set: { targets: reordered } },
    );
    expect(await advance(op)).toMatchObject({
        operation: { phase: "canceled", access: "ended" },
    });
});
it("concurrent prepares and confirms produce one durable operation, cancellation and refund", async () => {
    const prepared = await Promise.all(
        Array.from({ length: 6 }, () => prepare()),
    );
    expect(new Set(prepared.map((op) => op.operationId)).size).toBe(1);
    await Promise.all(prepared.map((op) => advance(op)));
    const result = await advance(prepared[0], "reconcile");
    expect(result).toMatchObject({
        kind: "operation",
        operation: {
            phase: "canceled",
            access: "ended",
            refund: { kind: "refund", status: "succeeded", amount: 5000 },
            closingGift: {
                libraryHref: "/dashboard/my-content",
                consequences: { retainedCount: 1 },
            },
        },
    });
    expect(f.api.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(f.api.refunds.create).toHaveBeenCalledTimes(1);
    expect((await Membership.findById(f.member._id)).status).toBe("expired");
    expect(
        await getLessonAccess({
            ...f.key,
            lessonId: "archive",
            requireMembership: true,
        }),
    ).toMatchObject({ kind: "denied" });
    expect(
        await getLessonAccess({
            ...f.key,
            lessonId: "drop",
            requireMembership: true,
        }),
    ).toMatchObject({ kind: "allowed", source: "retained" });
    expect((await User.findById(f.user._id)).subscribedToUpdates).toBe(true);
});
it("a timed-out refund leaves cancellation ended and never blindly retries a missing operation", async () => {
    const op = await prepare();
    f.api.refunds.create.mockRejectedValueOnce(
        new Error("timeout after dispatch"),
    );
    expect(await advance(op)).toMatchObject({
        operation: {
            phase: "canceled",
            access: "ended",
            refund: { kind: "uncertain" },
        },
    });
    expect(await advance(op, "reconcile")).toMatchObject({
        operation: { refund: { kind: "uncertain" } },
    });
    expect(f.api.refunds.create).toHaveBeenCalledTimes(1);
});
it("a crash after the durable first claim but before provider create stays uncertain", async () => {
    const op = await prepare();
    const original =
        BillingCancellation.findOneAndUpdate.bind(BillingCancellation);
    const spy = jest
        .spyOn(BillingCancellation, "findOneAndUpdate")
        .mockImplementation(((filter: any, ...args: any[]) => {
            if (filter["refund.kind"] === "not-started")
                return {
                    lean: async () => {
                        await (original as any)(filter, ...args).lean();
                        throw new Error(
                            "connection lost after acknowledged write",
                        );
                    },
                };
            return (original as any)(filter, ...args);
        }) as any);
    await expect(advance(op)).rejects.toThrow("connection lost");
    spy.mockRestore();
    expect((await BillingCancellation.findOne().lean())?.refund.kind).toBe(
        "claimed",
    );
    expect(await advance(op, "reconcile")).toMatchObject({
        operation: {
            phase: "canceled",
            access: "ended",
            refund: { kind: "uncertain" },
        },
    });
    expect(f.api.refunds.create).not.toHaveBeenCalled();
});
it("recovers an accepted refund after its local result write fails without creating twice", async () => {
    const op = await prepare();
    const original =
        BillingCancellation.findOneAndUpdate.bind(BillingCancellation);
    const spy = jest
        .spyOn(BillingCancellation, "findOneAndUpdate")
        .mockImplementation(((filter: any, update: any, ...args: any[]) => {
            if (update.$set?.refund?.kind === "result")
                throw new Error("refund result write failed");
            return (original as any)(filter, update, ...args);
        }) as any);
    await expect(advance(op)).rejects.toThrow("refund result write failed");
    spy.mockRestore();
    expect(await advance(op, "reconcile")).toMatchObject({
        operation: {
            phase: "canceled",
            access: "ended",
            refund: { status: "succeeded" },
        },
    });
    expect(f.api.refunds.create).toHaveBeenCalledTimes(1);
});
it("rejects a payment mode change before freezing access", async () => {
    const op = await prepare();
    f.deps.provider = async () => ({ client: f.api as any, livemode: true });
    await expect(advance(op)).rejects.toThrow("changed mode");
    expect((await Access.findOne().lean())?.state.kind).toBe("active");
    expect(f.api.subscriptions.cancel).not.toHaveBeenCalled();
});
it("native membership mirror failure keeps access capped and can finish without recanceling", async () => {
    const op = await prepare();
    const original = Membership.updateOne.bind(Membership);
    const spy = jest
        .spyOn(Membership, "updateOne")
        .mockImplementationOnce(() => {
            throw new Error("native mirror unavailable");
        });
    await expect(advance(op)).rejects.toThrow("native mirror unavailable");
    spy.mockRestore();
    expect((await Access.findOne().lean())?.state.kind).toBe("ended");
    expect(await advance(op, "reconcile")).toMatchObject({
        operation: { phase: "canceled", access: "ended" },
    });
    expect(f.api.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(f.api.refunds.create).toHaveBeenCalledTimes(1);
    expect(original).toBeDefined();
});
it("cancellation uncertainty stays capped and reconciles the provider's eventual cancellation", async () => {
    const op = await prepare();
    f.api.subscriptions.cancel.mockImplementationOnce(async () => {
        f.sub.status = "canceled";
        throw new Error("timeout");
    });
    expect(await advance(op)).toMatchObject({
        operation: { phase: "uncertain", access: "capped" },
    });
    expect((await Access.findOne().lean())?.state.kind).toBe("prepared");
    expect(f.api.refunds.create).not.toHaveBeenCalled();
    expect(await advance(op, "reconcile")).toMatchObject({
        operation: {
            phase: "canceled",
            access: "ended",
            refund: { status: "succeeded" },
        },
    });
    expect(f.api.subscriptions.cancel).toHaveBeenCalledTimes(1);
});
it("rejects expired/hash-changed/session-changed reviews before changing access", async () => {
    const op = await prepare();
    await expect(
        advanceMemberCancellation(
            f.ctx,
            {
                action: "confirm",
                operationId: op.operationId,
                quoteHash: "0".repeat(64),
            },
            f.deps,
        ),
    ).rejects.toThrow("review changed");
    await BillingCancellation.updateOne(
        { operationId: op.operationId },
        { $set: { expiresAt: new Date(f.now.getTime() - 1) } },
    );
    await expect(advance(op)).rejects.toThrow("review expired");
    const fresh = await prepare();
    await Membership.updateOne(
        { _id: f.member._id },
        { $set: { sessionId: "new-checkout" } },
    );
    await expect(advance(fresh)).rejects.toThrow("membership changed");
    expect((await Access.findOne().lean())?.state.kind).toBe("active");
    expect(f.api.subscriptions.cancel).not.toHaveBeenCalled();
});
it("expires the quote at the current period boundary, even when ten minutes remain", async () => {
    const end = Math.floor(f.now.getTime() / 1000) + 20;
    f.sub.current_period_end = end;
    f.invoice.lines.data[0].period.end = end;
    const op = await prepare();
    expect(op.quote.expiresAt).toBe(new Date(end * 1000).toISOString());
    f.deps.now = () => new Date(end * 1000);
    await expect(advance(op)).rejects.toThrow("review expired");
    expect(f.api.subscriptions.cancel).not.toHaveBeenCalled();
});
it("finishing an old confirmed cancellation never expires a concurrent new checkout session", async () => {
    const op = await prepare();
    f.api.subscriptions.cancel.mockImplementationOnce(async () => {
        f.sub.status = "canceled";
        await Membership.updateOne(
            { _id: f.member._id },
            {
                $set: {
                    sessionId: "new-session",
                    subscriptionId: "sub_new",
                    status: "active",
                },
            },
        );
        return f.sub;
    });
    expect(await advance(op)).toMatchObject({
        operation: { phase: "canceled", access: "ended" },
    });
    expect(await Membership.findById(f.member._id)).toMatchObject({
        sessionId: "new-session",
        subscriptionId: "sub_new",
        status: "active",
    });
    expect(
        (await Access.findOne({ membershipSessionId: "session" }).lean())?.state
            .kind,
    ).toBe("ended");
});
it("keeps confirmed cancellation ended when the refund requires review", async () => {
    const op = await prepare();
    f.api.refunds.create.mockRejectedValueOnce({
        type: "StripeInvalidRequestError",
        message: "private provider error",
    });
    expect(await advance(op)).toMatchObject({
        operation: {
            phase: "canceled",
            access: "ended",
            refund: { kind: "review-required", reason: "provider-rejected" },
            canReconcile: false,
        },
    });
    expect(await advance(op, "reconcile")).toMatchObject({
        operation: { refund: { kind: "review-required" } },
    });
    expect(f.api.refunds.create).toHaveBeenCalledTimes(1);
});
it("requires review for legacy timing without inventing an activation or freezing it", async () => {
    await Access.deleteMany({});
    await Membership.updateOne(
        { _id: f.member._id },
        { $unset: { accessActivation: 1 } },
    );
    expect(
        await prepareMemberCancellation(f.ctx, f.member.membershipId, f.deps),
    ).toEqual({ kind: "review-required", reason: "access-timing-unknown" });
    expect(await Access.countDocuments()).toBe(0);
    expect(await BillingCancellation.countDocuments()).toBe(0);
});
it("rejects newly unknown publication timing before claiming or freezing a reviewed cancellation", async () => {
    const op = await prepare();
    await Lesson.updateOne(
        { domain: f.domain._id, lessonId: "drop" },
        { $set: { publication: { kind: "legacy-unknown" } } },
    );
    await expect(advance(op)).rejects.toThrow("Access timing changed");
    expect((await Access.findOne().lean())?.state.kind).toBe("active");
    expect(
        (await BillingCancellation.findOne().lean())?.cancellation.kind,
    ).toBe("quoted");
    expect(f.api.subscriptions.cancel).not.toHaveBeenCalled();
    expect(f.api.refunds.create).not.toHaveBeenCalled();
});
it("stops before provider cancellation if provenance changes between preview and freeze", async () => {
    const op = await prepare();
    const original = retention.freezeBillingRetention;
    jest.spyOn(retention, "freezeBillingRetention").mockImplementationOnce(
        async (...args) => {
            await Lesson.updateOne(
                { domain: f.domain._id, lessonId: "drop" },
                { $set: { publication: { kind: "legacy-unknown" } } },
            );
            return original(...args);
        },
    );
    expect(await advance(op)).toMatchObject({
        operation: {
            phase: "review-required",
            access: "capped",
            reason: "access-timing-unknown",
        },
    });
    expect((await Access.findOne().lean())?.state.kind).toBe("prepared");
    expect(await advance(op, "reconcile")).toMatchObject({
        operation: {
            phase: "review-required",
            reason: "access-timing-unknown",
        },
    });
    expect(f.api.subscriptions.cancel).not.toHaveBeenCalled();
    expect(f.api.refunds.create).not.toHaveBeenCalled();
});
it("rejects other member/tenant operations and direct service Mimic writes", async () => {
    const op = await prepare();
    const another = {
        ...f.ctx,
        user: { ...f.user.toObject(), userId: "other-member" },
    };
    await expect(
        prepareMemberCancellation(another, f.member.membershipId, f.deps),
    ).rejects.toThrow("not found");
    await expect(
        advanceMemberCancellation(
            another,
            {
                action: "confirm",
                operationId: op.operationId,
                quoteHash: op.quote.hash,
            },
            f.deps,
        ),
    ).rejects.toThrow("not found");
    await expect(
        prepareMemberCancellation(
            { ...f.ctx, subdomain: { _id: "other-tenant" } },
            f.member.membershipId,
            f.deps,
        ),
    ).rejects.toThrow("Sign in");
    await expect(
        prepareMemberCancellation(
            { ...f.ctx, memberMimic: {} },
            f.member.membershipId,
            f.deps,
        ),
    ).rejects.toThrow("Exit Member Mimic");
    expect(f.api.subscriptions.cancel).not.toHaveBeenCalled();
});
it("ends included course access with its parent session and preserves unrelated/new sessions", async () => {
    await Membership.updateOne(
        { _id: f.member._id },
        { $set: { entityType: "community", entityId: "community" } },
    );
    await PaymentPlan.updateOne(
        { planId: f.member.paymentPlanId },
        {
            $set: {
                entityType: "community",
                entityId: "community",
                includedProducts: ["course"],
            },
        },
    );
    const child = await Membership.create({
        domain: f.domain._id,
        membershipId: "included",
        userId: f.user.userId,
        entityId: "course",
        entityType: "course",
        status: "active",
        paymentPlanId: f.member.paymentPlanId,
        sessionId: "session",
        isIncludedInPlan: true,
        accessActivation: f.member.accessActivation,
    });
    await ensureMembershipAccess({
        domainId: String(f.domain._id),
        membership: child,
    });
    const unrelated = await Membership.create({
        domain: f.domain._id,
        membershipId: "unrelated",
        userId: f.user.userId,
        entityId: "course",
        entityType: "course",
        status: "active",
        paymentPlanId: f.member.paymentPlanId,
        sessionId: "other-session",
        isIncludedInPlan: true,
    });
    const op = await prepare();
    await advance(op);
    expect((await Membership.findById(child._id)).status).toBe("expired");
    expect((await Membership.findById(f.member._id)).status).toBe("expired");
    expect((await Membership.findById(unrelated._id)).status).toBe("active");
    expect(
        (await Access.findOne({ membershipId: child.membershipId }).lean())
            ?.state.kind,
    ).toBe("ended");
});
