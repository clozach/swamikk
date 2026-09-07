jest.mock("../../../../logger", () => ({ logger: { error: jest.fn() } }));
jest.mock("../app", () => ({
    AppChannel: class {
        async send() {}
    },
}));
import { Constants } from "@courselit/common-models";
import DomainModel from "../../../../domain/model/domain";
import UserModel from "../../../../domain/model/user";
import NotificationPreferenceModel from "../../../model/notification-preference";
import { startDispatchNotificationWorker } from "../../../worker/dispatch-notification";
import { addMailJob } from "../../../../domain/handler";

let mockProcess: (job: any) => Promise<void>;
jest.mock("bullmq", () => ({
    Worker: jest.fn().mockImplementation((_name, handler) => {
        mockProcess = handler;
        return { on: jest.fn() };
    }),
}));
jest.mock("../../../../bullmq", () => ({
    registerWorkerEvents: jest.fn(),
    workerOptions: {},
}));
jest.mock("../../../../domain/handler", () => ({ addMailJob: jest.fn() }));
jest.mock("../../../../observability/posthog", () => ({
    captureError: jest.fn(),
    getDomainId: () => "test",
}));
jest.mock("@courselit/common-logic", () => ({
    getNotificationMessageAndHref: jest.fn().mockResolvedValue({
        message: "Service notice",
        href: "https://school.example/dashboard/notifications",
    }),
}));

it.each([
    Constants.ActivityType.COMMUNITY_MEMBERSHIP_GRANTED,
    Constants.ActivityType.COMMUNITY_COMMENT_REPLIED,
    Constants.ActivityType.PURCHASED,
])(
    "delivers an enabled %s notice with news off, while explicit activity preference/active/permission gates remain",
    async (activityType) => {
        (addMailJob as jest.Mock).mockClear();
        const domain = await (DomainModel as any).create({
            name: `service-${Math.random()}`,
            email: "owner@example.com",
        });
        const actor = await (UserModel as any).create({
            domain: domain._id,
            email: "actor@example.com",
            userId: `actor-${Math.random()}`,
            active: true,
        });
        const member = await (UserModel as any).create({
            domain: domain._id,
            email: "recipient@example.com",
            userId: `member-${Math.random()}`,
            active: true,
            subscribedToUpdates: false,
            permissions: ["course:manage_any"],
        });
        const pref = await (NotificationPreferenceModel as any).create({
            domain: domain._id,
            userId: member.userId,
            activityType,
            channels: ["email"],
        });
        startDispatchNotificationWorker();
        const job = {
            data: {
                domain: String(domain._id),
                userId: actor.userId,
                activityType,
                entityId: "entity",
                metadata: { forUserIds: [member.userId] },
            },
        };
        await mockProcess(job);
        expect(addMailJob).toHaveBeenCalledTimes(1);
        await pref.updateOne({ channels: [] });
        await mockProcess(job);
        expect(addMailJob).toHaveBeenCalledTimes(1);
        await pref.updateOne({ channels: ["email"] });
        await member.updateOne({ active: false });
        await mockProcess(job);
        expect(addMailJob).toHaveBeenCalledTimes(1);
        if (activityType === Constants.ActivityType.PURCHASED) {
            await member.updateOne({ active: true, permissions: [] });
            await mockProcess(job);
            expect(addMailJob).toHaveBeenCalledTimes(1);
        }
    },
);
