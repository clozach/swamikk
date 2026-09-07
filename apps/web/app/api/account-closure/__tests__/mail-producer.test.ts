import { randomUUID } from "crypto";
import Domain from "@/models/Domain";
import User from "@/models/User";
import DownloadLink from "@/models/DownloadLink";
import { createTemplateAndSendMail } from "@/graphql/mails/helpers";
import { createSubscription, sendCourseOverMail } from "@/graphql/mails/logic";
import { getPlans } from "@/graphql/paymentplans/logic";
import Course from "@/models/Course";
import Membership from "@/models/Membership";
import { beginAccountClosure } from "../../../../../../packages/common-logic/src/account-lifecycle/gate";
jest.mock("@/lib/record-activity", () => ({ recordActivity: jest.fn() }));
jest.mock("@/lib/trigger-sequences", () => ({ triggerSequences: jest.fn() }));
jest.mock("@/services/queue", () => ({ addMailJob: jest.fn() }));
jest.mock("@/graphql/paymentplans/logic", () => ({ getPlans: jest.fn() }));
jest.mock("@/app/api/payment/helpers", () => ({
    activateMembership: jest.fn(),
}));
let domain: any, user: any;
beforeEach(async () => {
    const id = randomUUID();
    domain = await Domain.create({ name: id, email: "school@example.com" });
    user = await User.create({
        domain: domain._id,
        userId: id,
        email: `${id}@example.com`,
        active: true,
    });
});
it("fences anonymous lead enrollment after resolving a real recipient", async () => {
    jest.spyOn(Course, "findOne").mockImplementationOnce(
        () =>
            ({ lean: async () => ({ courseId: "lead", lessons: [] }) }) as any,
    );
    jest.mocked(getPlans).mockResolvedValue([
        { planId: "free", type: "free" },
    ] as any);
    let release!: () => void, enter!: () => void;
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
    const writing = sendCourseOverMail("lead", user.email, {
        subdomain: domain,
        user: null,
        address: "https://school.example",
    } as any);
    await reached;
    const result = await beginAccountClosure({
        domainId: String(domain._id),
        userId: user.userId,
    });
    release();
    await writing;
    expect(result.kind).toBe("pending");
});
afterEach(async () => {
    jest.restoreAllMocks();
    await Membership.deleteMany({ domain: domain._id });
});
it("does not treat a free download request as newsletter consent", async () => {
    jest.spyOn(Course, "findOne").mockImplementationOnce(
        () =>
            ({ lean: async () => ({ courseId: "lead", lessons: [] }) }) as any,
    );
    jest.mocked(getPlans).mockResolvedValue([
        { planId: "free", type: "free" },
    ] as any);
    const email = `${randomUUID()}@example.com`;
    await sendCourseOverMail("lead", email, {
        subdomain: domain,
        user: null,
    } as any);
    const lead = await User.findOne({ domain: domain._id, email });
    expect(lead?.subscribedToUpdates).toBe(false);
});
it.each([true, false])(
    "preserves an existing download recipient's newsletter preference (%s)",
    async (consent) => {
        await User.updateOne(
            { _id: user._id },
            { $set: { subscribedToUpdates: consent } },
        );
        jest.spyOn(Course, "findOne").mockImplementationOnce(
            () =>
                ({
                    lean: async () => ({ courseId: "lead", lessons: [] }),
                }) as any,
        );
        jest.mocked(getPlans).mockResolvedValue([
            { planId: "free", type: "free" },
        ] as any);
        await sendCourseOverMail("lead", user.email, {
            subdomain: domain,
            user: null,
        } as any);
        expect((await User.findById(user._id))?.subscribedToUpdates).toBe(
            consent,
        );
    },
);
it("still opts in and resubscribes through explicit newsletter signup", async () => {
    expect(
        await createSubscription("Member", user.email, {
            subdomain: domain,
            user: null,
        } as any),
    ).toBe(true);
    expect((await User.findById(user._id))?.subscribedToUpdates).toBe(true);
});
it("holds the recipient while a lead download link is being created", async () => {
    let release!: () => void, enter!: () => void;
    const reached = new Promise<void>((resolve) => {
        enter = resolve;
    });
    const paused = new Promise<void>((resolve) => {
        release = resolve;
    });
    const create = DownloadLink.create.bind(DownloadLink);
    jest.spyOn(DownloadLink, "create").mockImplementationOnce(
        async (...args: any[]) => {
            enter();
            await paused;
            return (create as any)(...args);
        },
    );
    const writing = createTemplateAndSendMail({
        course: {
            courseId: "course",
            title: "Practice",
            creatorId: "creator",
        } as any,
        ctx: {
            subdomain: domain,
            user: null,
            address: "https://school.example",
        } as any,
        user,
    });
    await reached;
    const result = await beginAccountClosure({
        domainId: String(domain._id),
        userId: user.userId,
    });
    release();
    await writing;
    expect(result.kind).toBe("pending");
});
