import mongoose from "mongoose";
import { Worker } from "bullmq";
import { Constants } from "@courselit/common-models";
import User from "../../../domain/model/user";
import Notification from "../../model/notification";
import { notificationEmitter } from "../../utils/emitter";
import { startNotificationWorker } from "../notification";
import {
    beginAccountClosure,
    requireAccountErasureReady,
    markAccountErasing,
    finishAccountClosure,
} from "../../../../../../packages/common-logic/src/account-lifecycle/gate";
import { AccountLifecycleModel } from "../../../../../../packages/common-logic/src/account-lifecycle/model";

jest.mock("bullmq", () => ({ Worker: jest.fn() }));
jest.mock("../../../bullmq", () => ({
    registerWorkerEvents: jest.fn(),
    workerOptions: {},
}));
jest.mock("../../../observability/posthog", () => ({
    captureError: jest.fn(),
    getDomainId: String,
}));
jest.mock("../../../logger", () => ({ logger: { error: jest.fn() } }));
let domain: mongoose.Types.ObjectId,
    notification: any,
    processJob: (job: any) => Promise<void>;
beforeEach(async () => {
    jest.clearAllMocks();
    domain = new mongoose.Types.ObjectId();
    for (const userId of ["actor", "recipient"])
        await User.create({
            domain,
            userId,
            email: `${userId}@example.com`,
            active: true,
        });
    notification = await Notification.create({
        domain,
        userId: "actor",
        forUserId: "recipient",
        activityType: Constants.ActivityType.ENROLLED,
        entityId: "course",
        metadata: { title: "Current" },
    });
    (Worker as unknown as jest.Mock).mockImplementation((_name, processor) => {
        processJob = processor;
        return {};
    });
    jest.spyOn(notificationEmitter, "emit").mockReturnValue(true);
    startNotificationWorker();
});
afterEach(async () => {
    jest.restoreAllMocks();
    for (const model of [User, Notification, AccountLifecycleModel] as any[])
        await model.deleteMany({ domain });
});
const job = () => ({
    data: {
        ...notification.toObject(),
        metadata: { title: "Stale queued copy" },
    },
});

it("drops a queued copy after its notification record has been erased", async () => {
    await Notification.deleteOne({ _id: notification._id });
    await processJob(job());
    expect(notificationEmitter.emit).not.toHaveBeenCalled();
});
it.each(["actor", "recipient"])(
    "drops delivery after the %s starts closure even while its user row exists",
    async (userId) => {
        await beginAccountClosure({ domainId: String(domain), userId });
        await processJob(job());
        expect(notificationEmitter.emit).not.toHaveBeenCalled();
    },
);
it("emits the current persisted row instead of a stale queued payload", async () => {
    await processJob(job());
    expect(notificationEmitter.emit).toHaveBeenCalledWith(
        "newNotification",
        expect.objectContaining({ metadata: { title: "Current" } }),
    );
});
it("holds cleanup until an already-reserved final delivery completes", async () => {
    let entered!: () => void,
        release!: () => void,
        reads = 0;
    const began = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const barrier = new Promise<void>((resolve) => {
        release = resolve;
    });
    const original = Notification.findOne.bind(Notification);
    jest.spyOn(Notification, "findOne").mockImplementation(((
        ...args: any[]
    ) => {
        const query = (original as any)(...args);
        reads++;
        if (reads !== 2) return query;
        return {
            lean: async () => {
                const row = await query.lean();
                entered();
                await barrier;
                return row;
            },
        };
    }) as any);
    const processing = processJob(job());
    await began;
    const key = { domainId: String(domain), userId: "recipient" };
    const closure = await beginAccountClosure(key);
    const readiness = await requireAccountErasureReady(key).then(
        () => "ready",
        (error) => error.code,
    );
    release();
    await processing;
    expect({ closure: closure.kind, readiness }).toEqual({
        closure: "pending",
        readiness: "account_busy",
    });
    expect(notificationEmitter.emit).toHaveBeenCalledTimes(1);
    await markAccountErasing(key);
    await Notification.deleteOne({ _id: notification._id });
    await User.deleteOne({ domain, userId: "recipient" });
    await finishAccountClosure(key);
    (notificationEmitter.emit as jest.Mock).mockClear();
    await processJob(job());
    expect(notificationEmitter.emit).not.toHaveBeenCalled();
});
