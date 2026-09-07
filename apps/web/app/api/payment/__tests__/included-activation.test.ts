/** @jest-environment node */
import mongoose from "mongoose";
import { Constants } from "@courselit/common-models";
import Course from "@models/Course";
import Membership from "@models/Membership";
import { addIncludedProductsMemberships } from "@/graphql/paymentplans/logic";

jest.mock("@/graphql/users/logic", () => ({
    runPostMembershipTasks: jest.fn(),
}));
const { runPostMembershipTasks } = jest.requireMock("@/graphql/users/logic");
const domain = new mongoose.Types.ObjectId();
const startedAt = new Date("2026-09-01T12:00:00Z");
const args = {
    domain,
    userId: "included-member",
    sessionId: "parent-session",
    startedAt,
    paymentPlan: {
        planId: "parent-plan",
        type: Constants.PaymentPlanType.SUBSCRIPTION,
        includedProducts: ["included-course"],
    } as any,
};

beforeEach(async () => {
    jest.clearAllMocks();
    await Course.create({
        domain,
        courseId: "included-course",
        title: "Included course",
        slug: "included-course",
        cost: 0,
        costType: "free",
        privacy: Constants.ProductAccessType.PUBLIC,
        type: Constants.CourseType.COURSE,
        creatorId: "teacher",
        published: true,
    });
});
afterEach(async () => {
    await Promise.all([
        Membership.deleteMany({ domain }),
        Course.deleteMany({ domain }),
    ]);
});

it("creates one included membership across concurrent deliveries with the parent start", async () => {
    await Promise.all(
        Array.from({ length: 8 }, () => addIncludedProductsMemberships(args)),
    );
    const memberships = await Membership.find({ domain });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].accessActivation).toMatchObject({
        sessionId: args.sessionId,
        startedAt,
    });
    expect(
        runPostMembershipTasks.mock.calls.filter(([arg]) => !arg.recoveryOnly),
    ).toHaveLength(1);
});

it("recovers legacy generated IDs without creating duplicates or inventing an activation date", async () => {
    await Membership.create({
        domain,
        membershipId: "legacy-included-id",
        userId: args.userId,
        sessionId: args.sessionId,
        entityId: "included-course",
        entityType: Constants.MembershipEntityType.COURSE,
        paymentPlanId: args.paymentPlan.planId,
        isIncludedInPlan: true,
        status: Constants.MembershipStatus.ACTIVE,
    });
    await addIncludedProductsMemberships(args);
    const memberships = await Membership.find({ domain });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].membershipId).toBe("legacy-included-id");
    expect(memberships[0].accessActivation).toBeUndefined();
    expect(runPostMembershipTasks).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryOnly: true }),
    );
});

it("keeps an ended included period ended; a new parent session receives a new period", async () => {
    await addIncludedProductsMemberships(args);
    await Membership.updateMany(
        { domain },
        { $set: { status: Constants.MembershipStatus.EXPIRED } },
    );
    await expect(addIncludedProductsMemberships(args)).rejects.toThrow(
        "no longer active",
    );
    await addIncludedProductsMemberships({
        ...args,
        sessionId: "rejoined-session",
        startedAt: new Date("2026-09-06T12:00:00Z"),
    });
    expect(await Membership.countDocuments({ domain })).toBe(2);
    expect(
        await Membership.countDocuments({
            domain,
            status: Constants.MembershipStatus.ACTIVE,
        }),
    ).toBe(1);
});
