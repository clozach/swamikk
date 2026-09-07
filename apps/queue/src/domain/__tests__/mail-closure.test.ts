import { randomUUID } from "crypto";
import mongoose from "mongoose";
import User from "../model/user";
import { processMailJob } from "../worker";
import { addMailJob } from "../handler";
import mailQueue from "../queue";
import { sendMail } from "../../mail";
import {
    claimDelivery,
    finishDelivery,
} from "../../../../../packages/common-logic/src/member-access/drip";
import { MembershipAccessModel } from "../../../../../packages/common-logic/src/member-access/models";
import {
    beginAccountClosure,
    requireAccountErasureReady,
} from "../../../../../packages/common-logic/src/account-lifecycle/gate";

jest.mock("../queue", () => ({
    __esModule: true,
    default: { add: jest.fn() },
}));
jest.mock("bullmq", () => ({ Worker: jest.fn() }));
jest.mock("../../bullmq", () => ({
    registerWorkerEvents: jest.fn(),
    workerOptions: {},
}));
jest.mock("../../mail", () => ({ sendMail: jest.fn() }));
jest.mock("../../logger", () => ({ logger: { error: jest.fn() } }));
jest.mock("../../observability/posthog", () => ({
    captureError: jest.fn(),
    getDomainId: (id: string) => id,
}));
jest.mock(
    "../../../../../packages/common-logic/src/member-access/drip",
    () => ({ claimDelivery: jest.fn(), finishDelivery: jest.fn() }),
);
let user: any, actor: any, job: any;
beforeEach(async () => {
    jest.clearAllMocks();
    const domain = new mongoose.Types.ObjectId();
    user = await User.create({
        domain,
        userId: randomUUID(),
        email: `${randomUUID()}@example.com`,
        active: true,
    });
    actor = await User.create({
        domain,
        userId: randomUUID(),
        email: `${randomUUID()}@example.com`,
        active: true,
    });
    job = {
        data: {
            domainId: String(domain),
            to: user.email,
            from: "school@example.com",
            subject: "Access",
            body: "Private notice",
            account: { userId: user.userId, actorUserId: actor.userId },
        },
    };
    jest.mocked(sendMail).mockResolvedValue(undefined);
    jest.mocked(claimDelivery).mockResolvedValue({
        kind: "claimed",
        claimId: "claim",
    });
    jest.mocked(finishDelivery).mockResolvedValue(undefined);
});
it.each(["recipient", "actor"])(
    "suppresses a known-account queued message after %s closure",
    async (who) => {
        await beginAccountClosure({
            domainId: job.data.domainId,
            userId: who === "recipient" ? user.userId : actor.userId,
        });
        await processMailJob(job);
        expect(sendMail).not.toHaveBeenCalled();
    },
);
it("holds recipient and actor reservations through SMTP", async () => {
    let release!: () => void, enter!: () => void;
    const reached = new Promise<void>((resolve) => {
        enter = resolve;
    });
    const paused = new Promise<void>((resolve) => {
        release = resolve;
    });
    jest.mocked(sendMail).mockImplementation(async () => {
        enter();
        await paused;
    });
    const writing = processMailJob(job);
    await reached;
    const result = await beginAccountClosure({
        domainId: job.data.domainId,
        userId: user.userId,
    });
    release();
    await writing;
    expect(result.kind).toBe("pending");
});
it("does not enqueue copied member mail after closure", async () => {
    await beginAccountClosure({
        domainId: job.data.domainId,
        userId: user.userId,
    });
    await addMailJob({ ...job.data, to: [user.email] });
    expect(mailQueue.add).not.toHaveBeenCalled();
});
it("never transfers old account mail to a new account with the same email", async () => {
    await User.deleteOne({ _id: user._id });
    await User.create({
        domain: user.domain,
        userId: randomUUID(),
        email: user.email,
        active: true,
    });
    await processMailJob(job);
    expect(sendMail).not.toHaveBeenCalled();
});
it("requires the exact tenant and current email for known-account delivery", async () => {
    await processMailJob({
        data: { ...job.data, domainId: String(new mongoose.Types.ObjectId()) },
    });
    await processMailJob({
        data: { ...job.data, to: "different@example.com" },
    });
    expect(sendMail).not.toHaveBeenCalled();
});
it("fences historical drip provenance through SMTP and its result", async () => {
    const periodId = randomUUID();
    await MembershipAccessModel.collection.insertOne({
        domain: user.domain,
        id: periodId,
        userId: user.userId,
    } as any);
    job.data.account = undefined;
    job.data.drip = { periodId, deliveryId: "delivery" };
    let release!: () => void, enter!: () => void;
    const reached = new Promise<void>((resolve) => {
        enter = resolve;
    });
    const paused = new Promise<void>((resolve) => {
        release = resolve;
    });
    jest.mocked(finishDelivery).mockImplementation(async () => {
        enter();
        await paused;
    });
    const writing = processMailJob(job);
    await reached;
    const result = await beginAccountClosure({
        domainId: job.data.domainId,
        userId: user.userId,
    });
    release();
    await writing;
    expect(result.kind).toBe("pending");
    await requireAccountErasureReady({
        domainId: job.data.domainId,
        userId: user.userId,
    });
});
it("keeps provenance-less historical and sign-in mail outside account lookup", async () => {
    await processMailJob({ data: { ...job.data, account: undefined } });
    expect(sendMail).toHaveBeenCalledTimes(1);
});
it("drops an old drip job when its exact access period is gone", async () => {
    await processMailJob({
        data: {
            ...job.data,
            account: undefined,
            drip: { periodId: randomUUID(), deliveryId: "gone" },
        },
    });
    expect(claimDelivery).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
});
it("rejects malformed account provenance without sending", async () => {
    await expect(
        processMailJob({ data: { ...job.data, account: { userId: "" } } }),
    ).rejects.toThrow();
    expect(sendMail).not.toHaveBeenCalled();
});
it("carries stable account provenance and removes finalized new member mail payloads", async () => {
    await addMailJob({ ...job.data, to: [user.email] });
    expect(mailQueue.add).toHaveBeenCalledWith(
        "mail",
        expect.objectContaining({
            domainId: job.data.domainId,
            account: job.data.account,
            to: user.email,
        }),
        { removeOnComplete: true, removeOnFail: true },
    );
});
