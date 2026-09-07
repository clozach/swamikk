import { randomUUID } from "crypto";
import mongoose from "mongoose";
import {
    DomainSchema,
    FeedbackSchema,
    type Domain as DomainRecord,
    type InternalFeedback,
} from "@courselit/orm-models";
import User from "../../domain/model/user";
import { collectFeedbackNotifications } from "../process";
import { sendFeedbackNotification } from "../transport";
import { beginAccountClosure } from "../../../../../packages/common-logic/src/account-lifecycle/gate";
jest.mock("../transport", () => ({ sendFeedbackNotification: jest.fn() }));
jest.mock("../../logger", () => ({ logger: { error: jest.fn() } }));
const Domain: mongoose.Model<DomainRecord> =
    (mongoose.models.Domain as mongoose.Model<DomainRecord>) ||
    mongoose.model<DomainRecord>("Domain", DomainSchema);
const Feedback: mongoose.Model<InternalFeedback> =
    (mongoose.models.ContextualFeedback as mongoose.Model<InternalFeedback>) ||
    mongoose.model<InternalFeedback>("ContextualFeedback", FeedbackSchema);
let user: any, domain: any;
beforeEach(async () => {
    jest.clearAllMocks();
    domain = await Domain.create({
        name: randomUUID(),
        email: "owner@example.com",
        settings: {
            feedbackMailbox: {
                kind: "enabled",
                recipient: "owner@example.com",
                intervalMinutes: 60,
                approvedBy: "admin",
                approvedAt: new Date().toISOString(),
            },
        },
    });
    user = await User.create({
        domain: domain._id,
        userId: randomUUID(),
        email: `${randomUUID()}@example.com`,
        active: true,
    });
    await Feedback.create({
        domain: domain._id,
        id: randomUUID(),
        text: "Private message",
        target: { kind: "page", path: "/about", componentId: "title" },
        actor: { kind: "member", userId: user.userId },
        state: "open",
        notification: {
            kind: "pending",
            attempts: 0,
            nextAttemptAt: new Date(0).toISOString(),
        },
    });
    jest.mocked(sendFeedbackNotification).mockResolvedValue({
        kind: "accepted",
    });
});
afterEach(() => jest.restoreAllMocks());
it("does not send a copied member feedback excerpt after account closure", async () => {
    await beginAccountClosure({
        domainId: String(domain._id),
        userId: user.userId,
    });
    await collectFeedbackNotifications();
    expect(sendFeedbackNotification).not.toHaveBeenCalled();
});
it("holds closure while private feedback SMTP is in flight", async () => {
    let enter!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => {
        enter = resolve;
    });
    const paused = new Promise<void>((resolve) => {
        release = resolve;
    });
    jest.mocked(sendFeedbackNotification).mockImplementationOnce(async () => {
        enter();
        await paused;
        return { kind: "accepted" };
    });
    const writing = collectFeedbackNotifications();
    await reached;
    const result = await beginAccountClosure({
        domainId: String(domain._id),
        userId: user.userId,
    });
    release();
    await writing;
    expect(result.kind).toBe("pending");
});
it("holds closure until the feedback SMTP result is recorded", async () => {
    let enter!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => {
        enter = resolve;
    });
    const paused = new Promise<void>((resolve) => {
        release = resolve;
    });
    const update = Feedback.updateOne.bind(Feedback);
    jest.spyOn(Feedback, "updateOne").mockImplementationOnce((async (
        ...args: any[]
    ) => {
        enter();
        await paused;
        return (update as any)(...args);
    }) as any);
    const writing = collectFeedbackNotifications();
    await reached;
    const result = await beginAccountClosure({
        domainId: String(domain._id),
        userId: user.userId,
    });
    release();
    await writing;
    expect(result.kind).toBe("pending");
});
it("leaves anonymous feedback independent of an unrelated account closure", async () => {
    await Feedback.updateMany(
        { domain: domain._id },
        { $set: { actor: { kind: "visitor" } } },
    );
    await beginAccountClosure({
        domainId: String(domain._id),
        userId: user.userId,
    });
    await collectFeedbackNotifications();
    expect(sendFeedbackNotification).toHaveBeenCalledTimes(1);
});
