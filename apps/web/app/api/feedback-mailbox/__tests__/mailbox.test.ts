import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { UIConstants } from "@courselit/common-models";
import {
    initialFeedbackNotification,
    processFeedbackMailboxDomain,
} from "@courselit/common-logic";
import DomainModel from "@/models/Domain";
import { FeedbackModel } from "@/services/content-changes/models";
import {
    createFeedback,
    feedbackView,
    setFeedbackState,
} from "@/services/content-changes/feedback";
import {
    saveMailboxSettings,
    mailboxSettingsView,
} from "@/services/feedback-mailbox/settings";
import { reconcileFeedbackNotification } from "@/services/feedback-mailbox/reconcile";
import { POST } from "../route";

jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
}));
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));

const at = new Date("2026-09-07T10:00:00.000Z");
const enabled = {
    kind: "enabled" as const,
    recipient: "owner@example.com",
    intervalMinutes: 60,
    approvedBy: "admin",
    approvedAt: at.toISOString(),
};
const input = {
    text: "A private question",
    target: {
        kind: "page" as const,
        path: "/about",
        componentId: "about-title",
    },
};
let domain: any, ctx: any;
const read = (id: string) => FeedbackModel.findOne({ domain: domain._id, id });
const run = (send: jest.Mock, time = at) =>
    processFeedbackMailboxDomain({
        model: FeedbackModel,
        domain,
        send,
        now: () => time,
    });
async function seed(
    notification: any = {
        kind: "pending",
        attempts: 0,
        nextAttemptAt: at.toISOString(),
    },
) {
    return FeedbackModel.create({
        domain: domain._id,
        id: randomUUID(),
        ...input,
        actor: { kind: "visitor" },
        state: "open",
        notification,
    });
}

beforeAll(async () => {
    await FeedbackModel.init();
});
beforeEach(async () => {
    domain = await DomainModel.create({
        name: `mailbox-${randomUUID()}`,
        email: "owner@example.com",
        settings: { feedbackMailbox: enabled },
    });
    ctx = {
        subdomain: domain,
        user: {
            domain: domain._id,
            userId: "admin",
            permissions: [
                UIConstants.permissions.manageSite,
                UIConstants.permissions.manageSettings,
            ],
        },
    };
});

test("saving public feedback atomically retains notification intent without delivering or disclosing it", async () => {
    const result = await createFeedback(input, { ...ctx, user: undefined });
    expect(result.notification).toBeUndefined();
    const record = await read(result.id);
    expect(record?.notification?.kind).toBe("pending");
    expect(feedbackView(record!, true).notification?.kind).toBe("pending");
});
test("notification cadence uses the next configured boundary", () => {
    expect(
        initialFeedbackNotification(enabled, new Date("2026-09-07T10:15:00Z")),
    ).toEqual({
        kind: "pending",
        attempts: 0,
        nextAttemptAt: "2026-09-07T11:00:00.000Z",
    });
});
test("simultaneous workers claim once and accepted messages are not resent", async () => {
    const record = await seed();
    const send = jest.fn().mockResolvedValue({ kind: "accepted" });
    await Promise.all([run(send), run(send)]);
    await run(send);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await read(record.id))?.notification?.kind).toBe("accepted");
});
test("definite transient rejection retries after backoff, then stops after acceptance", async () => {
    const record = await seed();
    const send = jest
        .fn()
        .mockResolvedValueOnce({
            kind: "not-accepted",
            reason: "rejected",
            retryable: true,
        })
        .mockResolvedValue({ kind: "accepted" });
    await run(send);
    await run(send);
    expect(send).toHaveBeenCalledTimes(1);
    await run(send, new Date(at.getTime() + 60000));
    await run(send, new Date(at.getTime() + 120000));
    expect(send).toHaveBeenCalledTimes(2);
    expect((await read(record.id))?.notification?.kind).toBe("accepted");
});
test("unknown transport outcome is never automatically retried", async () => {
    const record = await seed();
    const send = jest
        .fn()
        .mockRejectedValue(new Error("connection disappeared"));
    await run(send);
    await run(send, new Date(at.getTime() + 86400000));
    expect(send).toHaveBeenCalledTimes(1);
    expect((await read(record.id))?.notification?.kind).toBe("uncertain");
});
test("a crash after acceptance but before persistence becomes uncertain without resending", async () => {
    const record = await seed({
        kind: "sending",
        attempts: 1,
        attemptId: "crashed",
        recipient: enabled.recipient,
        startedAt: at.toISOString(),
        leaseUntil: at.toISOString(),
    });
    const send = jest.fn();
    await run(send);
    expect(send).not.toHaveBeenCalled();
    expect((await read(record.id))?.notification?.kind).toBe("uncertain");
});
test("closed feedback waits; reopening preserves intent and accepted state", async () => {
    const record = await seed();
    const send = jest.fn().mockResolvedValue({ kind: "accepted" });
    await setFeedbackState(record.id, "close", ctx);
    await run(send);
    expect(send).not.toHaveBeenCalled();
    await setFeedbackState(record.id, "reopen", ctx);
    await run(send);
    await setFeedbackState(record.id, "close", ctx);
    await setFeedbackState(record.id, "reopen", ctx);
    await run(send);
    expect(send).toHaveBeenCalledTimes(1);
});
test("delivery off and other tenants never enter this domain's transport", async () => {
    await seed();
    const other = await FeedbackModel.create({
        domain: (
            await DomainModel.create({
                name: `other-${randomUUID()}`,
                email: "other@example.com",
            })
        )._id,
        id: randomUUID(),
        ...input,
        actor: { kind: "visitor" },
        state: "open",
        notification: {
            kind: "pending",
            attempts: 0,
            nextAttemptAt: at.toISOString(),
        },
    });
    const send = jest.fn().mockResolvedValue({ kind: "accepted" });
    await processFeedbackMailboxDomain({
        model: FeedbackModel,
        domain: {
            ...domain.toObject(),
            settings: { feedbackMailbox: { kind: "off" } },
        },
        send,
        now: () => at,
    });
    expect(send).not.toHaveBeenCalled();
    await run(send);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await FeedbackModel.findById(other._id))?.notification?.kind).toBe(
        "pending",
    );
});
test("settings need manageSettings plus explicit private-recipient approval", async () => {
    await expect(
        saveMailboxSettings(
            {
                kind: "enabled",
                recipient: "ops@example.com",
                intervalMinutes: 1,
                approvedPrivateRecipient: true,
            },
            {
                ...ctx,
                user: {
                    ...ctx.user,
                    permissions: [UIConstants.permissions.manageSite],
                },
            },
        ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
        saveMailboxSettings(
            {
                kind: "enabled",
                recipient: "ops@example.com",
                intervalMinutes: 1,
            },
            ctx,
        ),
    ).rejects.toBeDefined();
    const saved = await saveMailboxSettings(
        {
            kind: "enabled",
            recipient: "ops@example.com",
            intervalMinutes: 1,
            approvedPrivateRecipient: true,
        },
        ctx,
    );
    expect(saved.settings).toMatchObject({
        kind: "enabled",
        recipient: "ops@example.com",
        approvedBy: "admin",
    });
    await saveMailboxSettings({ kind: "off" }, ctx);
    expect((await mailboxSettingsView(ctx)).settings.kind).toBe("off");
});
test("visitor/member/foreign-tenant cannot read operational mailbox settings", async () => {
    for (const user of [
        undefined,
        { ...ctx.user, permissions: [] },
        { ...ctx.user, domain: "other" },
    ]) {
        await expect(
            mailboxSettingsView({ ...ctx, user }),
        ).rejects.toMatchObject({ status: 403 });
    }
});
test("uncertain delivery requires explicit verification, then records the actual admin", async () => {
    const record = await seed({
        kind: "uncertain",
        attempts: 1,
        attemptId: "uncertain-one",
        recipient: enabled.recipient,
        startedAt: at.toISOString(),
    });
    const body = {
        action: "confirm-received",
        expectedUpdatedAt: record.updatedAt.toISOString(),
    };
    await expect(
        reconcileFeedbackNotification(record.id, body, ctx),
    ).rejects.toMatchObject({ status: 409 });
    await reconcileFeedbackNotification(
        record.id,
        { ...body, verified: true },
        ctx,
    );
    expect((await read(record.id))?.notification).toMatchObject({
        kind: "accepted",
        evidence: "operator",
    });
    expect((await read(record.id))?.notificationReview).toMatchObject({
        action: "confirm-received",
        by: "admin",
    });
    await expect(
        reconcileFeedbackNotification(
            record.id,
            {
                action: "retry",
                expectedUpdatedAt: (await read(
                    record.id,
                ))!.updatedAt.toISOString(),
            },
            ctx,
        ),
    ).rejects.toMatchObject({ status: 409 });
});
test("stale delivery reconciliation cannot overwrite newer state", async () => {
    const record = await seed({
        kind: "failed",
        attempts: 1,
        reason: "configuration",
    });
    await expect(
        reconcileFeedbackNotification(
            record.id,
            { action: "retry", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" },
            ctx,
        ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await read(record.id))?.notification?.kind).toBe("failed");
});
test("settings route rejects cross-origin writes before session or persistence", async () => {
    const response = await POST(
        new NextRequest("https://school.example.com/api/feedback-mailbox", {
            method: "POST",
            headers: {
                origin: "https://other.example.com",
                "content-type": "application/json",
            },
            body: JSON.stringify({ kind: "off" }),
        }),
    );
    expect(response.status).toBe(403);
});

test("failure to persist SMTP acceptance never causes an automatic second send", async () => {
    const record = await seed();
    const send = jest.fn().mockResolvedValue({ kind: "accepted" });
    const write = jest
        .spyOn(FeedbackModel, "updateOne")
        .mockRejectedValueOnce(new Error("database unavailable"));
    await expect(run(send)).rejects.toThrow("database unavailable");
    write.mockRestore();
    expect((await read(record.id))?.notification?.kind).toBe("sending");
    await run(send, new Date(at.getTime() + 181000));
    expect(send).toHaveBeenCalledTimes(1);
    expect((await read(record.id))?.notification?.kind).toBe("uncertain");
});

test("automatic retries stop after five definite failures", async () => {
    const record = await seed();
    const send = jest.fn().mockResolvedValue({
        kind: "not-accepted",
        reason: "rejected",
        retryable: true,
    });
    for (let i = 0; i < 7; i++)
        await run(send, new Date(at.getTime() + i * 3600000));
    expect(send).toHaveBeenCalledTimes(5);
    expect((await read(record.id))?.notification).toEqual({
        kind: "failed",
        attempts: 5,
        reason: "rejected",
    });
});
