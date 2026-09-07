import { randomUUID } from "crypto";
import mongoose from "mongoose";
import User from "../model/user";
import Ongoing from "../model/ongoing-sequence";
import Delivery from "../model/email-delivery";
import * as queries from "../queries";
import { sendMail } from "../../mail";
import { processOngoingSequence } from "../process-ongoing-sequences/process-ongoing-sequence";
import {
    beginAccountClosure,
    requireAccountErasureReady,
} from "../../../../../packages/common-logic/src/account-lifecycle/gate";

jest.mock("../../mail", () => ({ sendMail: jest.fn() }));
jest.mock("../../logger", () => ({ logger: { error: jest.fn() } }));
jest.mock("../../utils/get-unsub-link", () => ({
    getUnsubLink: () => "https://school.example/unsubscribe",
}));
jest.mock("../../utils/get-site-url", () => ({
    getSiteUrl: () => "https://school.example",
}));
let user: any, ongoing: any, domain: any;
beforeEach(async () => {
    jest.restoreAllMocks();
    jest.mocked(sendMail).mockReset();
    process.env.PIXEL_SIGNING_SECRET = "sequence-closure-test";
    process.env.EMAIL_FROM = "service@example.com";
    const id = randomUUID(),
        domainId = new mongoose.Types.ObjectId();
    user = await (User as any).create({
        domain: domainId,
        userId: id,
        email: `${id}@example.com`,
        active: true,
        subscribedToUpdates: true,
    });
    domain = {
        _id: domainId,
        id: String(domainId),
        name: id,
        settings: { mailingAddress: "School" },
        quota: {
            mail: { daily: 100, monthly: 1000, dailyCount: 0, monthlyCount: 0 },
        },
        incrementEmailCount: jest.fn(),
    };
    ongoing = await Ongoing.create({
        domain: domainId,
        userId: id,
        sequenceId: id,
        nextEmailScheduledTime: Date.now(),
        sentEmailIds: [],
    });
    const email = {
        emailId: "email",
        subject: "News",
        published: true,
        content: { content: [], style: {}, meta: {} },
        delayInMillis: 0,
    };
    jest.spyOn(queries, "getDomain").mockResolvedValue(domain);
    jest.spyOn(queries, "getUser").mockResolvedValue(user.toObject());
    jest.spyOn(queries, "getSequence").mockResolvedValue({
        sequenceId: id,
        creatorId: id,
        type: "sequence",
        emails: [email],
        emailsOrder: [email.emailId],
        from: { name: "School" },
    } as any);
});
afterEach(() => jest.restoreAllMocks());

it("waits for the in-flight SMTP attempt and its delivery record before erasing recipient data", async () => {
    let entered!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const sending = new Promise<void>((resolve) => {
        release = resolve;
    });
    jest.mocked(sendMail).mockImplementation(async () => {
        entered();
        await sending;
    });
    const writing = processOngoingSequence(ongoing._id);
    await reached;
    const key = { domainId: domain.id, userId: user.userId };
    expect((await beginAccountClosure(key)).kind).toBe("pending");
    await expect(requireAccountErasureReady(key)).rejects.toMatchObject({
        code: "account_busy",
    });
    release();
    await writing;
    await requireAccountErasureReady(key);
    await Delivery.deleteMany({ domain: domain._id, userId: user.userId });
    await Ongoing.deleteMany({ domain: domain._id, userId: user.userId });
    expect(
        await Delivery.countDocuments({
            domain: domain._id,
            userId: user.userId,
        }),
    ).toBe(0);
    expect(sendMail).toHaveBeenCalledTimes(1); // Already accepted SMTP cannot be recalled.
});
it("refuses a queued sequence attempt once recipient closure has begun", async () => {
    await beginAccountClosure({ domainId: domain.id, userId: user.userId });
    await expect(processOngoingSequence(ongoing._id)).rejects.toMatchObject({
        code: "account_unavailable",
    });
    expect(sendMail).not.toHaveBeenCalled();
    expect(
        await Delivery.countDocuments({
            domain: domain._id,
            userId: user.userId,
        }),
    ).toBe(0);
});
