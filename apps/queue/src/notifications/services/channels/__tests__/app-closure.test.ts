import mongoose from "mongoose";
import { Constants } from "@courselit/common-models";
import User from "../../../../domain/model/user";
import Notification from "../../../model/notification";
import { AppChannel } from "../app";
import { addNotificationJob } from "../../enqueue";
import {
    beginAccountClosure,
    requireAccountErasureReady,
    markAccountErasing,
    finishAccountClosure,
} from "../../../../../../../packages/common-logic/src/account-lifecycle/gate";
import { AccountLifecycleModel } from "../../../../../../../packages/common-logic/src/account-lifecycle/model";

jest.mock("../../enqueue", () => ({
    addNotificationJob: jest.fn().mockResolvedValue(undefined),
}));
let domain: mongoose.Types.ObjectId, actor: any, recipient: any, payload: any;
const channel = new AppChannel();
beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    domain = new mongoose.Types.ObjectId();
    actor = await User.create({
        domain,
        userId: "actor",
        email: "actor@example.com",
        active: true,
    });
    recipient = await User.create({
        domain,
        userId: "recipient",
        email: "recipient@example.com",
        active: true,
    });
    payload = {
        domain: { _id: domain },
        actorUserId: actor.userId,
        actor,
        recipient,
        activityType: Constants.ActivityType.ENROLLED,
        entityId: "course",
        metadata: { title: "Practice" },
    };
});
afterEach(async () => {
    jest.restoreAllMocks();
    for (const model of [User, Notification, AccountLifecycleModel] as any[])
        await model.deleteMany({ domain });
});
const key = (userId: string) => ({ domainId: String(domain), userId });
async function erase(userId: string) {
    await markAccountErasing(key(userId));
    await Notification.deleteMany({
        domain,
        $or: [{ userId }, { forUserId: userId }],
    });
    await User.deleteOne({ domain, userId });
    await finishAccountClosure(key(userId));
}

it.each(["actor", "recipient"])(
    "keeps %s closure pending until an in-app write drains, then leaves no related row",
    async (role) => {
        let entered!: () => void, release!: () => void;
        const began = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const barrier = new Promise<void>((resolve) => {
            release = resolve;
        });
        const original = Notification.create.bind(Notification);
        jest.spyOn(Notification, "create").mockImplementationOnce((async (
            ...args: any[]
        ) => {
            entered();
            await barrier;
            return (original as any)(...args);
        }) as any);
        const sending = channel.send(payload);
        await began;
        const closing = await beginAccountClosure(key(role));
        const readiness = await requireAccountErasureReady(key(role)).then(
            () => "ready",
            (error) => error.code,
        );
        if (closing.kind !== "pending") await erase(role);
        release();
        await sending;
        if (closing.kind === "pending") await erase(role);
        expect({
            closing: closing.kind,
            readiness,
            rows: await Notification.countDocuments({ domain }),
        }).toEqual({ closing: "pending", readiness: "account_busy", rows: 0 });
        (addNotificationJob as jest.Mock).mockClear();
        await expect(channel.send(payload)).rejects.toMatchObject({
            code: "account_unavailable",
        });
        expect(addNotificationJob).not.toHaveBeenCalled();
    },
);

it.each(["actor", "recipient"])(
    "refuses a cached inactive %s before persisting or enqueuing",
    async (role) => {
        await User.updateOne(
            { domain, userId: role },
            { $set: { active: false } },
        );
        await expect(channel.send(payload)).rejects.toMatchObject({
            code: "account_unavailable",
        });
        expect(await Notification.countDocuments({ domain })).toBe(0);
        expect(addNotificationJob).not.toHaveBeenCalled();
    },
);

it("persists and enqueues a permitted notification once with both reservations released", async () => {
    await channel.send(payload);
    expect(
        await Notification.countDocuments({
            domain,
            userId: actor.userId,
            forUserId: recipient.userId,
        }),
    ).toBe(1);
    expect(addNotificationJob).toHaveBeenCalledTimes(1);
    expect(addNotificationJob).toHaveBeenCalledWith({
        domain: String(domain),
        notificationId: expect.any(String),
    });
    expect(
        await AccountLifecycleModel.countDocuments({
            domain,
            "writes.0": { $exists: true },
        }),
    ).toBe(0);
});
