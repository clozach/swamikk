import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { GET } from "../route";
import { readAdminOverview } from "@/services/admin-overview/read";
import { fixture, invoice, refund, type Fixture } from "./fixtures";
import Membership from "@/models/Membership";
import User from "@/models/User";
import Course from "@/models/Course";
import Activity from "@/models/Activity";
import Webhook from "@/models/StripeWebhookReceipt";
import RefundRequest from "@/models/RefundRequest";
import {
    FeedbackModel,
    ContentChangeModel,
} from "@/services/content-changes/models";
import { MembershipAccessModel } from "../../../../../../packages/common-logic/src/member-access/models";
import { getActivities } from "@/graphql/activities/logic";
import { MEMBER_MIMIC_COOKIE } from "@/services/member-mimic/constants";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
let f: Fixture;
beforeEach(async () => {
    jest.restoreAllMocks();
    f = await fixture();
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { email: f.admin.email },
    });
});
function req(query = "", headers = {}) {
    return new NextRequest(`https://example.com/api/admin-overview${query}`, {
        headers: { domain: f.domain.name, ...headers },
    });
}

test("REST requires active tenant settings authority, rejects any Mimic cookie, bounds the period and disables caching", async () => {
    const session = auth.api.getSession as unknown as jest.Mock;
    session.mockResolvedValueOnce(null);
    expect((await GET(req())).status).toBe(403);
    session.mockResolvedValueOnce({ user: { email: f.user.email } });
    expect((await GET(req())).status).toBe(403);
    const other = await fixture();
    session.mockResolvedValueOnce({ user: { email: other.admin.email } });
    expect((await GET(req())).status).toBe(401);
    for (const value of ["expired", "", "a".repeat(64)])
        expect(
            (await GET(req("", { cookie: `${MEMBER_MIMIC_COOKIE}=${value}` })))
                .status,
        ).toBe(403);
    expect((await GET(req("?days=900"))).status).toBe(400);
    const response = await GET(req("?days=30"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).days).toBe(30);
    await expect(
        readAdminOverview({ ...f.ctx, subdomain: other.domain }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
        readAdminOverview({ ...f.ctx, memberMimic: {} }),
    ).rejects.toMatchObject({ status: 403 });
    await User.updateOne({ _id: f.admin._id }, { $set: { active: false } });
    expect((await GET(req())).status).toBe(401);
});

test("native receipt totals separate currency/mode, ignore duplicate activity, exclude synthetic/undated payments and preserve gross alongside refunds", async () => {
    const testReceipt = await invoice(f);
    await refund(f, testReceipt.invoiceId);
    await invoice(f, {
        amount: 20,
        paymentMode: "live",
        currencyISOCode: "usd",
    });
    await invoice(f, { amount: 3, paymentMode: undefined });
    await invoice(f, { amount: 777, settlement: undefined });
    await invoice(f, { amount: 999, paymentProcessor: "synthetic" });
    const other = await fixture();
    await invoice(other, { amount: 666 });
    await Activity.collection.insertMany(
        [9, 9, 20, 777].map((cost) => ({
            domain: f.domain._id,
            entityId: f.course.courseId,
            type: "purchased",
            metadata: { cost },
            createdAt: f.now,
        })),
    );
    // Proves the mechanism in both old global Overview and product Sales callers.
    for (const entityId of [undefined, f.course.courseId])
        expect(
            (
                await getActivities({
                    ctx: f.ctx,
                    type: "purchased",
                    duration: "7d",
                    entityId,
                })
            ).count,
        ).toBe(815);
    const view = await readAdminOverview(f.ctx, 7, f.now);
    expect(view.payments).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                mode: "test",
                currency: "NZD",
                paid: 9,
                observedRefunds: 1,
                receipts: 1,
                refundEvidenceCount: 1,
            }),
            expect.objectContaining({
                mode: "live",
                currency: "USD",
                paid: 20,
                observedRefunds: 0,
                refundEvidenceCount: 0,
            }),
            expect.objectContaining({
                mode: "unknown",
                currency: "NZD",
                paid: 3,
            }),
        ]),
    );
    expect(view.payments).toHaveLength(3);
    expect(view.undatedPaidReceipts).toBe(1);
    await Course.create({
        domain: f.domain._id,
        courseId: `blog-${f.id}`,
        slug: `blog-${f.id}`,
        title: "Blog",
        creatorId: f.admin.userId,
        type: "blog",
        privacy: "public",
        costType: "free",
        cost: 0,
        published: true,
    });
    expect((await readAdminOverview(f.ctx, 7, f.now)).publishedProducts).toBe(
        1,
    );
});

test("newer exact native money evidence wins over a stale webhook observation in totals and attention", async () => {
    const paid = await invoice(f);
    const ledger = await refund(f, paid.invoiceId);
    await RefundRequest.create({
        domain: f.domain._id,
        requestId: `request-${f.id}`,
        invoiceId: paid.invoiceId,
        membershipId: f.member.membershipId,
        membershipSessionId: f.member.sessionId,
        userId: f.user.userId,
        productName: "Library",
        reason: "private reason",
        state: "complete",
        routing: "human-review",
        assignedTo: "Al",
        accessDecision: "unchanged",
        access: "resolved",
        revision: 2,
        reviewHash: "x",
        quote: { chargeId: ledger.chargeId, mode: "test" },
        refund: {
            kind: "result",
            observationId: "new-native",
            observedAt: f.now,
            result: {
                kind: "refund",
                refundId: "re_private",
                amount: 100,
                currency: "nzd",
                status: "failed",
            },
        },
    });
    const view = await readAdminOverview(f.ctx, 7, f.now);
    expect(view.payments[0]).toMatchObject({
        paid: 9,
        observedRefunds: 0,
        refundsCheckedAt: f.now.toISOString(),
    });
    expect(
        view.attention.filter((item) => item.source === "refunds"),
    ).toHaveLength(0);
    expect(
        view.attention.find((item) => item.source === "refund-requests")?.state,
    ).toBe("failed");
});

test("paid/access inference checks current session after 60 seconds, distinguishes measured processing, and performs no repair", async () => {
    await invoice(f);
    await invoice(f); // Same current membership gets one alert.
    const before = await Membership.findById(f.member._id).lean();
    let view = await readAdminOverview(f.ctx, 7, f.now);
    expect(
        view.attention.filter((item) => item.kind === "paid-access-review"),
    ).toHaveLength(1);
    expect(view.attention[0].member?.userId).toBe(f.user.userId);
    expect(await Membership.findById(f.member._id).lean()).toEqual(before);
    expect(
        await MembershipAccessModel.countDocuments({ domain: f.domain._id }),
    ).toBe(0);
    await Membership.updateOne(
        { _id: f.member._id },
        { $set: { sessionId: "rejoined" } },
    );
    expect((await readAdminOverview(f.ctx, 7, f.now)).attention).toHaveLength(
        0,
    );
    await Membership.updateOne(
        { _id: f.member._id },
        { $set: { sessionId: f.member.sessionId, status: "active" } },
    );
    expect((await readAdminOverview(f.ctx, 7, f.now)).attention).toHaveLength(
        0,
    ); // Native active legacy fallback grants ordinary access, not a missing ledger failure.
    await MembershipAccessModel.create({
        domain: f.domain._id,
        id: `period-${f.id}`,
        userId: f.user.userId,
        courseId: f.course.courseId,
        membershipId: f.member.membershipId,
        membershipSessionId: f.member.sessionId,
        start: { kind: "legacy-unknown" },
        state: {
            kind: "freezing",
            operationId: "cancel",
            cutoff: f.now,
            requestedAt: f.now,
        },
        createdAt: f.now,
        updatedAt: f.now,
    });
    view = await readAdminOverview(f.ctx, 7, f.now);
    expect(view.attention.map((item) => item.kind)).toEqual([
        "access-processing",
    ]);
    expect(view.accessRecords?.processing).toBe(1);
    const fresh = await fixture();
    await invoice(fresh, {
        settlement: {
            at: new Date(fresh.now.getTime() - 59_000),
            source: "stripe-checkout-confirmed",
        },
    });
    expect(
        (await readAdminOverview(fresh.ctx, 7, fresh.now)).attention,
    ).toHaveLength(0);
});

test("private text, addresses, provider IDs, error bodies and inactive identities never reach diagnostic responses", async () => {
    await invoice(f);
    await Webhook.create({
        domain: f.domain._id,
        eventId: `evt_SECRET-${f.id}`,
        objectId: "sub_SECRET",
        type: "customer.subscription.deleted",
        mode: "test",
        state: {
            kind: "review-required",
            reason: "token_SECRET user@example.com raw-url",
        },
    });
    await FeedbackModel.create({
        domain: f.domain._id,
        id: `feedback-${f.id}`,
        text: "journal_SECRET",
        target: {
            kind: "page",
            path: "/private?token_SECRET",
            componentId: "x",
        },
        actor: { kind: "member", userId: f.user.userId },
        photoMediaIds: ["photo_SECRET"],
        state: "open",
        notification: {
            kind: "uncertain",
            recipient: "private-mailbox@example.com",
            attempts: 1,
            attemptId: "attempt_SECRET",
            startedAt: f.now.toISOString(),
        },
    });
    let view = await readAdminOverview(f.ctx, 7, f.now);
    expect(view.attention.map((item) => item.kind)).toEqual(
        expect.arrayContaining([
            "webhook-review",
            "mail-uncertain",
            "paid-access-review",
        ]),
    );
    const json = JSON.stringify(view);
    for (const secret of [
        "SECRET",
        f.user.email,
        f.user.name,
        "private-mailbox",
        "user@example.com",
        "raw-url",
    ])
        expect(json).not.toContain(secret);
    await User.updateOne({ _id: f.user._id }, { $set: { active: false } });
    view = await readAdminOverview(f.ctx, 7, f.now);
    expect(
        view.attention.find((item) => item.kind === "paid-access-review")
            ?.member?.userId,
    ).toBeUndefined();
    const settingsOnly = {
        ...f.ctx,
        user: { ...f.admin.toObject(), permissions: ["setting:manage"] },
    };
    expect(
        JSON.stringify(await readAdminOverview(settingsOnly, 7, f.now)),
    ).not.toContain(f.user.userId);
});

test("an unavailable source is visible and does not erase the remaining measured records", async () => {
    await invoice(f);
    jest.spyOn(Webhook, "find").mockImplementationOnce(() => {
        throw new Error("private connection string");
    });
    const view = await readAdminOverview(f.ctx, 7, f.now);
    expect(
        view.sources.find((item) => item.source === "webhooks"),
    ).toMatchObject({ state: "unavailable", loaded: 0, latestRecordAt: null });
    expect(view.payments[0].paid).toBe(9);
    expect(JSON.stringify(view)).not.toContain("private connection");
});

test("large selections expose record and attention limits instead of claiming complete totals", async () => {
    await ContentChangeModel.collection.insertMany(
        Array.from({ length: 501 }, (_, i) => ({
            domain: f.domain._id,
            id: `${f.id}-${i}`,
            state: { kind: "uncertain", reason: "not public" },
            updatedAt: new Date(f.now.getTime() - i),
            createdAt: f.now,
        })),
    );
    const view = await readAdminOverview(f.ctx, 7, f.now);
    expect(
        view.sources.find((item) => item.source === "content-changes"),
    ).toMatchObject({ state: "available", loaded: 500, limited: true });
    expect(view.attention).toHaveLength(50);
    expect(view.attentionTotal).toBe(500);
    expect(view.attentionLimited).toBe(true);
    expect(new Set(view.attention.map((item) => item.diagnosticId)).size).toBe(
        50,
    );
});

test("saved unknown release evidence is measured attention, never silently repaired or confused with a missed activation", async () => {
    await invoice(f);
    await Membership.updateOne(
        { _id: f.member._id },
        { $set: { status: "expired" } },
    );
    const snapshot = {
        cutoff: f.now,
        visibleLessonIds: [],
        retainedLessonIds: [],
        unknownReleaseCount: 4,
    };
    await MembershipAccessModel.create({
        domain: f.domain._id,
        id: `unknown-${f.id}`,
        userId: f.user.userId,
        courseId: f.course.courseId,
        membershipId: f.member.membershipId,
        membershipSessionId: f.member.sessionId,
        start: { kind: "legacy-unknown" },
        createdAt: f.now,
        updatedAt: f.now,
        state: {
            kind: "ended",
            operationId: "confirmed-cancellation",
            snapshot,
            endedAt: f.now,
        },
    });
    const before = await MembershipAccessModel.findOne({
        domain: f.domain._id,
    }).lean();
    const view = await readAdminOverview(f.ctx, 7, f.now);
    expect(view.attention.map((item) => item.kind)).toEqual([
        "retention-review",
    ]);
    expect(view.accessRecords).toEqual({ active: 0, processing: 0, ended: 1 });
    expect(view.paidAccessChecks.checked).toBe(0);
    expect(
        await MembershipAccessModel.findOne({ domain: f.domain._id }).lean(),
    ).toEqual(before);
});

test("a confirmed cancellation with an uncertain refund reports the money uncertainty instead of the canceled access state", async () => {
    const Cancellation = (await import("@/models/BillingCancellation")).default;
    await Cancellation.create({
        domain: f.domain._id,
        userId: f.user.userId,
        operationId: `cancel-${f.id}`,
        membershipId: f.member.membershipId,
        membershipSessionId: f.member.sessionId,
        quote: { mode: "test" },
        expiresAt: f.now,
        consequences: {},
        targets: [],
        cancellation: { kind: "canceled", cutoff: f.now, confirmedAt: f.now },
        access: "ended",
        refund: {
            kind: "result",
            result: { kind: "uncertain", reason: "private-provider-body" },
        },
    });
    const view = await readAdminOverview(f.ctx, 7, f.now);
    expect(view.attention).toEqual([
        expect.objectContaining({
            source: "cancellations",
            kind: "refund-processing",
            state: "uncertain",
        }),
    ]);
    expect(JSON.stringify(view)).not.toContain("private-provider-body");
});

test("failed authoritative access reads are unavailable, not successful checks or missed-access claims", async () => {
    await invoice(f);
    const reads = await import(
        "../../../../../../packages/common-logic/src/member-access/read"
    );
    jest.spyOn(reads, "getMemberCourseReadScope").mockRejectedValueOnce(
        new Error("private failure"),
    );
    const view = await readAdminOverview(f.ctx, 7, f.now);
    expect(view.paidAccessChecks).toEqual({
        checked: 0,
        limited: false,
        unavailable: true,
    });
    expect(view.attention).toHaveLength(0);
});
