import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import Domain from "@/models/Domain";
import User from "@/models/User";
import Account from "@/models/Account";
import EmailDelivery from "@/models/EmailDelivery";
import OngoingSequence from "@/models/OngoingSequence";
import RefundRequest from "@/models/RefundRequest";
import {
    MembershipModel,
    InvoiceModel,
} from "@/services/member-billing/models";
import { ContactPreferencesModel } from "@/services/contact-preferences/model";
import { deleteUserRefundDrafts } from "@/services/refund-requests/cleanup";
import { withRefundOperatorWrite } from "@/services/refund-requests/account-write";
import { requestContext } from "@/services/content-changes/http";
import { withGraphqlAccountWrites } from "@/services/account-closure/graphql-write";
import { AccountLifecycleModel } from "../../../../../../packages/common-logic/src/account-lifecycle/model";
import { beginAccountClosure } from "../../../../../../packages/common-logic/src/account-lifecycle/gate";
import { eraseAccount } from "@/services/account-closure/erase";
import { internal } from "@/config/strings";
import { Constants } from "@courselit/common-models";
import { updateUser } from "@/graphql/users/logic";
import { GET, DELETE, PATCH } from "../route";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({ deleteMedia: jest.fn() }));
jest.mock("@/payments-new", () => ({
    getPaymentMethodFromSettings: jest.fn(),
}));
jest.mock("@/graphql/communities/logic", () => ({
    ...jest.requireActual("@/graphql/communities/logic"),
    deleteCommunityPosts: jest.fn(),
}));
let domain: any, user: any, owner: any, ctx: any;
const session = auth.api.getSession as unknown as jest.Mock;
function request(
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
) {
    return new NextRequest("https://school.example/api/account-closure", {
        method,
        headers: {
            domain: domain.name,
            host: "school.example",
            origin: "https://school.example",
            "content-type": "application/json",
            ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}
function identity(age = 0) {
    return {
        user: { id: String(user._id), email: user.email },
        session: {
            userId: String(user._id),
            createdAt: new Date(Date.now() - age),
        },
    };
}
async function refund(fields: Record<string, unknown> = {}) {
    return RefundRequest.create({
        domain: domain._id,
        requestId: randomUUID(),
        invoiceId: randomUUID(),
        membershipId: "membership",
        membershipSessionId: "session",
        userId: user.userId,
        productName: "Practice",
        reason: "Private note",
        state: "draft",
        routing: "evidence-review",
        assignedTo: "Al",
        accessDecision: "policy-pending",
        access: "unchanged",
        refund: { kind: "not-started" },
        reviewHash: "a".repeat(64),
        revision: 0,
        ...fields,
    });
}
beforeEach(async () => {
    jest.clearAllMocks();
    const id = randomUUID();
    domain = await Domain.create({
        name: id,
        email: `owner-${id}@example.com`,
    });
    owner = await User.create({
        domain: domain._id,
        userId: `owner-${id}`,
        email: domain.email,
        active: true,
        permissions: ["user:manage", "setting:manage"],
    });
    user = await User.create({
        domain: domain._id,
        userId: id,
        email: `${id}@example.com`,
        active: true,
    });
    ctx = { subdomain: domain, user, address: "https://school.example" };
    session.mockResolvedValue(identity());
});

it("requires the real persisted session to be recently authenticated and blocks Mimic/cross-origin confirmation", async () => {
    session.mockResolvedValue(identity(11 * 60_000));
    const review = await (await GET(request())).json();
    expect(review.recentIdentity).toBe(false);
    expect(session).toHaveBeenCalledWith(
        expect.objectContaining({ query: { disableCookieCache: true } }),
    );
    expect(
        (
            await DELETE(
                request("DELETE", {
                    reviewHash: review.reviewHash,
                    confirmation: "CLOSE",
                }),
            )
        ).status,
    ).toBe(403);
    session.mockResolvedValue(identity());
    expect(
        (
            await DELETE(
                request(
                    "DELETE",
                    { reviewHash: review.reviewHash, confirmation: "CLOSE" },
                    { origin: "https://foreign.example" },
                ),
            )
        ).status,
    ).toBe(403);
    expect(
        (
            await GET(
                request("GET", undefined, {
                    cookie: "courselit.member-mimic=invalid",
                }),
            )
        ).status,
    ).toBe(403);
    expect(await User.exists({ _id: user._id })).toBeTruthy();
});
it("rejects an authenticated session for a missing/inactive user instead of downgrading to visitor", async () => {
    await User.updateOne({ _id: user._id }, { $set: { active: false } });
    await expect(requestContext(request())).rejects.toMatchObject({
        code: "unauthorized",
    });
});
it("blocks provider subscriptions and unresolved submitted refunds before touching private data", async () => {
    await MembershipModel.create({
        domain: domain._id,
        userId: user.userId,
        membershipId: randomUUID(),
        sessionId: "session",
        entityId: "course",
        entityType: "course",
        paymentPlanId: "plan",
        status: "active",
        subscriptionId: "sub_private",
    });
    const review = await (await GET(request())).json();
    expect(review.blockers.map((item: any) => item.kind)).toEqual([
        "membership",
    ]);
    expect(
        (
            await DELETE(
                request("DELETE", {
                    reviewHash: review.reviewHash,
                    confirmation: "CLOSE",
                }),
            )
        ).status,
    ).toBe(409);
    expect(
        await AccountLifecycleModel.exists({
            domain: domain._id,
            userId: user.userId,
            state: { $ne: "active" },
        }),
    ).toBeNull();
    await MembershipModel.deleteMany({ domain: domain._id });
    await refund({ state: "submitted", submittedAt: new Date() });
    expect((await (await GET(request())).json()).blockers[0].kind).toBe(
        "financial",
    );
    expect((await User.findById(user._id))?.active).toBe(true);
});
it("erases private choices/drafts and linked sessions/accounts while preserving invoice relationships", async () => {
    const membership = await MembershipModel.create({
        domain: domain._id,
        userId: user.userId,
        membershipId: randomUUID(),
        sessionId: "session",
        entityId: "course",
        entityType: "course",
        paymentPlanId: "plan",
        status: "active",
    });
    await InvoiceModel.create({
        domain: domain._id,
        invoiceId: randomUUID(),
        membershipId: membership.membershipId,
        membershipSessionId: "session",
        amount: 50,
        currencyISOCode: "NZD",
        paymentProcessor: "stripe",
        status: "paid",
    });
    await Account.insertMany(
        ["one", "two"].map((accountId) => ({
            domain: domain._id,
            userId: user._id,
            accountId,
            providerId: "credential",
        })),
    );
    await mongoose.connection.collection("sessions").insertMany(
        ["one", "two"].map((token) => ({
            domain: domain._id,
            userId: user._id,
            token,
        })),
    );
    await ContactPreferencesModel.create({
        domain: domain._id,
        userId: user.userId,
        state: "active",
        contact: { kind: "email", value: "private@example.com" },
        checkIns: "occasional",
        photoJpeg: Buffer.from("private"),
        photoVersion: 1,
        revision: 0,
        updatedAt: new Date(),
    });
    await refund();
    const review = await (await GET(request())).json();
    const response = await DELETE(
        request("DELETE", {
            reviewHash: review.reviewHash,
            confirmation: "CLOSE",
        }),
    );
    expect(await response.json()).toEqual({ kind: "closed" });
    expect(await User.exists({ _id: user._id })).toBeNull();
    expect(
        await Account.countDocuments({ domain: domain._id, userId: user._id }),
    ).toBe(0);
    expect(
        await mongoose.connection
            .collection("sessions")
            .countDocuments({ domain: domain._id, userId: user._id }),
    ).toBe(0);
    const preferences = await ContactPreferencesModel.findOne({
        domain: domain._id,
        userId: user.userId,
    })
        .select("+photoJpeg")
        .lean();
    expect(preferences).toMatchObject({ state: "deleted" });
    expect(preferences?.contact).toBeUndefined();
    expect(preferences?.photoJpeg).toBeUndefined();
    expect(await RefundRequest.countDocuments({ domain: domain._id })).toBe(0);
    expect(
        await InvoiceModel.countDocuments({
            domain: domain._id,
            membershipId: membership.membershipId,
        }),
    ).toBe(1);
    expect((await MembershipModel.findById(membership._id))?.status).toBe(
        "expired",
    );
    expect(
        (
            await AccountLifecycleModel.findOne({
                domain: domain._id,
                userId: user.userId,
            })
        )?.state,
    ).toBe("erased");
});
it("blocks a creator membership handover that would transfer a member's receipt identity", async () => {
    const membership = await MembershipModel.create({
        domain: domain._id,
        userId: user.userId,
        membershipId: randomUUID(),
        sessionId: "session",
        entityId: "community",
        entityType: "community",
        paymentPlanId: "plan",
        status: "active",
        role: Constants.MembershipRole.MODERATE,
        joiningReason: internal.joining_reason_creator,
    });
    await InvoiceModel.create({
        domain: domain._id,
        invoiceId: randomUUID(),
        membershipId: membership.membershipId,
        membershipSessionId: "session",
        amount: 50,
        currencyISOCode: "NZD",
        paymentProcessor: "stripe",
        status: "paid",
    });
    await expect(eraseAccount(user, owner, ctx)).rejects.toMatchObject({
        code: "needs_review",
    });
    expect((await MembershipModel.findById(membership._id))?.userId).toBe(
        user.userId,
    );
    expect(await User.exists({ _id: user._id })).toBeTruthy();
});
it("keeps submitted audit, decision history and attempted refund locks during private draft cleanup", async () => {
    const rows = await Promise.all([
        refund(),
        refund({ state: "submitted", submittedAt: new Date() }),
        refund({ refund: { kind: "claimed", firstAttemptAt: new Date() } }),
        refund({
            decisionHistory: [
                {
                    kind: "declined",
                    explanation: "Review",
                    actorUserId: owner.userId,
                    at: new Date(),
                },
            ],
        }),
    ]);
    await deleteUserRefundDrafts(String(domain._id), user.userId);
    expect(await RefundRequest.exists({ _id: rows[0]._id })).toBeNull();
    expect(
        await RefundRequest.countDocuments({
            _id: { $in: rows.slice(1).map((row) => row._id) },
        }),
    ).toBe(3);
});
it("erases recipient mail history and queued sequences without assigning them to the successor", async () => {
    const delivery = await EmailDelivery.create({
        domain: domain._id,
        userId: user.userId,
        sequenceId: randomUUID(),
        emailId: randomUUID(),
    });
    const ongoing = await OngoingSequence.create({
        domain: domain._id,
        userId: user.userId,
        sequenceId: randomUUID(),
        nextEmailScheduledTime: Date.now(),
    });
    await eraseAccount(user, owner, ctx);
    expect(await EmailDelivery.exists({ _id: delivery._id })).toBeNull();
    expect(await OngoingSequence.exists({ _id: ongoing._id })).toBeNull();
});
it("blocks cross-actor GraphQL writes to the closing target and rejects mixed deletion mutations", async () => {
    await beginAccountClosure({
        domainId: String(domain._id),
        userId: user.userId,
    });
    const execute = jest.fn(async () => "written");
    await expect(
        withGraphqlAccountWrites(
            {
                source: "mutation($userId: String!) { updateUser(userId: $userId) { userId } }",
                variables: { userId: user.userId },
                ctx: { ...ctx, user: owner },
            },
            execute,
        ),
    ).rejects.toMatchObject({ code: "account_unavailable" });
    await expect(
        withGraphqlAccountWrites(
            {
                source: 'mutation { deleteUser(userId: "member") createDiscussionComment }',
                ctx: { ...ctx, user: owner },
            },
            execute,
        ),
    ).rejects.toThrow("on its own");
    expect(execute).not.toHaveBeenCalled();
});
it.each(["variable", "inline", "default"])(
    "fences the native updateUser input id for an admin editing a closing member (%s)",
    async (shape) => {
        await beginAccountClosure({
            domainId: String(domain._id),
            userId: user.userId,
        });
        const userData = { id: user.userId, bio: "Late private note" };
        const operator = { ...ctx, user: owner };
        const literal = `{ id: "${user.userId}", bio: "Late private note" }`;
        const source =
            shape === "inline"
                ? `mutation { updateUser(userData: ${literal}) { userId } }`
                : `mutation($data: UserUpdateInput!${shape === "default" ? ` = ${literal}` : ""}) { updateUser(userData: $data) { userId } }`;
        await expect(
            withGraphqlAccountWrites(
                {
                    source,
                    variables: shape === "variable" ? { data: userData } : {},
                    ctx: operator,
                },
                () => updateUser(userData, operator),
            ),
        ).rejects.toMatchObject({ code: "account_unavailable" });
        expect((await User.findById(user._id))?.bio).not.toBe(
            "Late private note",
        );
    },
);
it("keeps a crashed reservation visible and permits keep-account only before erasure", async () => {
    await AccountLifecycleModel.create({
        domain: domain._id,
        userId: user.userId,
        state: "active",
        writes: [
            { id: "crashed", purpose: "feedback", startedAt: new Date(0) },
        ],
        updatedAt: new Date(),
    });
    expect(
        (
            await beginAccountClosure({
                domainId: String(domain._id),
                userId: user.userId,
            })
        ).kind,
    ).toBe("pending");
    await expect(eraseAccount(user, owner, ctx)).rejects.toMatchObject({
        code: "account_busy",
    });
    const review = await (await GET(request())).json();
    expect(
        (
            await DELETE(
                request("DELETE", {
                    reviewHash: review.reviewHash,
                    confirmation: "CLOSE",
                }),
            )
        ).status,
    ).toBe(409);
    expect((await PATCH(request("PATCH", { action: "keep" }))).status).toBe(
        200,
    );
    expect(await User.exists({ _id: user._id })).toBeTruthy();
});
it("keeps operator recovery of an existing attempt available after account erasure, without a new attempt", async () => {
    const record = await refund({
        state: "review-required",
        submittedAt: new Date(),
        refund: { kind: "claimed", firstAttemptAt: new Date() },
    });
    await User.deleteOne({ _id: user._id });
    const execute = jest.fn(async () => "reconciled");
    const operator = { ...ctx, user: owner };
    await expect(
        withRefundOperatorWrite(
            operator,
            { action: "reconcile", requestId: record.requestId },
            execute,
        ),
    ).resolves.toBe("reconciled");
    await expect(
        withRefundOperatorWrite(
            operator,
            { action: "approve", requestId: record.requestId },
            execute,
        ),
    ).rejects.toMatchObject({ code: "account_closed" });
    expect(execute).toHaveBeenCalledTimes(1);
});
