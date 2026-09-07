import { randomUUID } from "crypto";
import Domain from "@/models/Domain";
import User from "@/models/User";
import Membership from "@/models/Membership";
import { inviteCustomer } from "@/graphql/users/logic";
import { withGraphqlAccountWrites } from "@/services/account-closure/graphql-write";
import { beginAccountClosure } from "../../../../../../packages/common-logic/src/account-lifecycle/gate";
jest.mock("@/lib/record-activity", () => ({ recordActivity: jest.fn() }));
jest.mock("@/lib/trigger-sequences", () => ({ triggerSequences: jest.fn() }));
jest.mock("@/services/queue", () => ({ addMailJob: jest.fn() }));
jest.mock("@/graphql/courses/logic", () => ({
    getCourseOrThrow: async () => ({
        courseId: "course",
        published: true,
        title: "Practice",
    }),
}));
jest.mock("@/graphql/paymentplans/logic", () => ({
    getInternalPaymentPlan: async () => ({ planId: "internal", type: "free" }),
}));
jest.mock("@/app/api/payment/helpers", () => ({
    activateMembership: jest.fn(),
}));
afterEach(() => jest.restoreAllMocks());
it("fences a newly resolved invitee that was absent from the Graph ingress snapshot", async () => {
    const domain = await Domain.create({
        name: randomUUID(),
        email: "owner@example.com",
    });
    const actor = await User.create({
        domain: domain._id,
        userId: randomUUID(),
        email: "owner@example.com",
        permissions: ["user:manage"],
        active: true,
    });
    const ctx = {
        subdomain: domain,
        user: actor,
        address: "https://school.example",
    } as any;
    const email = `${randomUUID()}@example.com`;
    let enter!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => {
        enter = resolve;
    });
    const paused = new Promise<void>((resolve) => {
        release = resolve;
    });
    const create = Membership.create.bind(Membership);
    jest.spyOn(Membership, "create").mockImplementationOnce(
        async (...args: any[]) => {
            enter();
            await paused;
            return (create as any)(...args);
        },
    );
    const writing = withGraphqlAccountWrites(
        {
            source: "mutation($email: String!) { inviteCustomer(email: $email) { userId } }",
            variables: { email },
            ctx,
        },
        () => inviteCustomer(email, [], "course", ctx),
    );
    await reached;
    const recipient = await User.findOne({ domain: domain._id, email });
    const result = await beginAccountClosure({
        domainId: String(domain._id),
        userId: recipient!.userId,
    });
    release();
    await writing;
    expect(result.kind).toBe("pending");
    expect(recipient?.subscribedToUpdates).toBe(false);
});
