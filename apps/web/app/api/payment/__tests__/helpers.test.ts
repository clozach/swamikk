/** @jest-environment node */
import mongoose from "mongoose";
import { Constants } from "@courselit/common-models";
import CommunityModel from "@models/Community";
import MembershipModel from "@models/Membership";
import UserModel from "@models/User";
import { AccountLifecycleModel } from "../../../../../../packages/common-logic/src/account-lifecycle/model";
import { activateMembership } from "../helpers";

jest.mock("@models/Community");
jest.mock("@/graphql/paymentplans/logic", () => ({
    addIncludedProductsMemberships: jest.fn(),
}));
jest.mock("@/graphql/users/logic", () => ({
    runPostMembershipTasks: jest.fn(),
}));
const { addIncludedProductsMemberships } = jest.requireMock(
    "@/graphql/paymentplans/logic",
);
const { runPostMembershipTasks } = jest.requireMock("@/graphql/users/logic");
const domain = { _id: new mongoose.Types.ObjectId() } as any;
const plan = {
    planId: "plan",
    type: Constants.PaymentPlanType.FREE,
    includedProducts: ["course"],
} as any;

async function member(extra = {}) {
    return MembershipModel.create({
        domain: domain._id,
        membershipId: new mongoose.Types.ObjectId().toString(),
        userId: "member",
        entityId: "community",
        entityType: Constants.MembershipEntityType.COMMUNITY,
        sessionId: "session",
        paymentPlanId: "plan",
        status: Constants.MembershipStatus.PENDING,
        ...extra,
    });
}

beforeEach(async () => {
    jest.clearAllMocks();
    await UserModel.create({
        domain: domain._id,
        userId: "member",
        email: "member@example.com",
        active: true,
    });
    (CommunityModel.findOne as jest.Mock).mockResolvedValue({
        autoAcceptMembers: true,
    });
});
afterEach(async () => {
    await MembershipModel.deleteMany({ domain: domain._id });
    await UserModel.deleteMany({ domain: domain._id });
    await AccountLifecycleModel.deleteMany({ domain: domain._id });
});

it("persists the activation date with ACTIVE and shares it with included products", async () => {
    const membership = await member();
    await activateMembership(domain, membership, plan);
    const saved = await MembershipModel.findById(membership._id).orFail();
    expect(saved.status).toBe(Constants.MembershipStatus.ACTIVE);
    expect(saved.accessActivation.sessionId).toBe("session");
    expect(saved.accessActivation.startedAt).toBeInstanceOf(Date);
    expect(addIncludedProductsMemberships).toHaveBeenCalledWith(
        expect.objectContaining({
            startedAt: saved.accessActivation.startedAt,
        }),
    );
    expect(runPostMembershipTasks).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryOnly: false }),
    );
});

it("recovers interrupted post-processing without moving the start or repeating messages", async () => {
    const membership = await member();
    runPostMembershipTasks.mockRejectedValueOnce(
        new Error("temporary failure"),
    );
    await expect(activateMembership(domain, membership, plan)).rejects.toThrow(
        "temporary failure",
    );
    const before = await MembershipModel.findById(membership._id).orFail();
    await activateMembership(domain, membership, plan);
    const after = await MembershipModel.findById(membership._id).orFail();
    expect(after.accessActivation.startedAt).toEqual(
        before.accessActivation.startedAt,
    );
    expect(runPostMembershipTasks).toHaveBeenLastCalledWith(
        expect.objectContaining({ recoveryOnly: true }),
    );
});

it("converges concurrent activation attempts to one start and one normal post-processing call", async () => {
    const membership = await member();
    await Promise.all(
        Array.from({ length: 8 }, async () =>
            activateMembership(
                domain,
                await MembershipModel.findById(membership._id).orFail(),
                plan,
            ),
        ),
    );
    expect(
        runPostMembershipTasks.mock.calls.filter(([arg]) => !arg.recoveryOnly),
    ).toHaveLength(1);
    const times = addIncludedProductsMemberships.mock.calls.map(([arg]) =>
        arg.startedAt.getTime(),
    );
    expect(new Set(times).size).toBe(1);
});

it("does not invent a start for a legacy ACTIVE membership", async () => {
    const membership = await member({
        status: Constants.MembershipStatus.ACTIVE,
    });
    await activateMembership(domain, membership, plan);
    expect(
        (await MembershipModel.findById(membership._id).orFail())
            .accessActivation,
    ).toBeUndefined();
    expect(addIncludedProductsMemberships).toHaveBeenCalledWith(
        expect.objectContaining({ startedAt: undefined }),
    );
});

it("keeps approval-required memberships pending without granting content or sending joined messages", async () => {
    (CommunityModel.findOne as jest.Mock).mockResolvedValue({
        autoAcceptMembers: false,
    });
    const membership = await member();
    await activateMembership(domain, membership, plan);
    const saved = await MembershipModel.findById(membership._id).orFail();
    expect(saved.status).toBe(Constants.MembershipStatus.PENDING);
    expect(saved.accessActivation).toBeUndefined();
    expect(addIncludedProductsMemberships).not.toHaveBeenCalled();
    expect(runPostMembershipTasks).not.toHaveBeenCalled();
});

it("cannot revive an ended session or activate a replaced checkout", async () => {
    const membership = await member();
    await MembershipModel.updateOne(
        { _id: membership._id },
        { $set: { status: Constants.MembershipStatus.EXPIRED } },
    );
    await expect(activateMembership(domain, membership, plan)).rejects.toThrow(
        "new checkout",
    );
    await MembershipModel.updateOne(
        { _id: membership._id },
        {
            $set: {
                status: Constants.MembershipStatus.PENDING,
                sessionId: "replacement",
            },
        },
    );
    await expect(activateMembership(domain, membership, plan)).rejects.toThrow(
        "session has changed",
    );
    expect(runPostMembershipTasks).not.toHaveBeenCalled();
});
