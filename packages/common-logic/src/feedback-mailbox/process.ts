import { randomUUID } from "crypto";
import type { Model } from "mongoose";
import type { InternalFeedback } from "@courselit/orm-models";
import type {
    FeedbackMailboxSettings,
    FeedbackMailResult,
    FeedbackNotification,
} from "@courselit/common-models";
import { completedFeedbackNotification, validMailboxSettings } from "./state";

export interface FeedbackMailboxDomain {
    _id: unknown;
    name: string;
    customDomain?: string;
    settings?: { feedbackMailbox?: FeedbackMailboxSettings };
}

/** Mongo is the durable outbox. SMTP is never retried following an uncertain result. */
export async function processFeedbackMailboxDomain({
    model,
    domain,
    send,
    now = () => new Date(),
    limit = 25,
}: {
    model: Model<InternalFeedback>;
    domain: FeedbackMailboxDomain;
    send: (
        record: InternalFeedback,
        claim: Extract<FeedbackNotification, { kind: "sending" }>,
        domain: FeedbackMailboxDomain,
    ) => Promise<FeedbackMailResult>;
    now?: () => Date;
    limit?: number;
}) {
    // A worker may have died after SMTP accepted but before persisting that fact.
    const expired = await model
        .find({
            domain: domain._id,
            "notification.kind": "sending",
            "notification.leaseUntil": { $lte: now().toISOString() },
        })
        .limit(limit);
    for (const record of expired) {
        const claim = record.notification as Extract<
            FeedbackNotification,
            { kind: "sending" }
        >;
        await model.updateOne(
            {
                domain: domain._id,
                id: record.id,
                "notification.kind": "sending",
                "notification.attemptId": claim.attemptId,
            },
            {
                $set: {
                    notification: completedFeedbackNotification(
                        claim,
                        { kind: "uncertain" },
                        now(),
                    ),
                },
            },
        );
    }
    const settings = domain.settings?.feedbackMailbox;
    if (!validMailboxSettings(settings)) return;
    for (let i = 0; i < limit; i++) {
        const at = now();
        const candidates = {
            domain: domain._id,
            state: "open",
            "notification.nextAttemptAt": { $lte: at.toISOString() },
            "notification.kind": { $in: ["pending", "failed"] },
        };
        const candidate = await model
            .findOne(candidates)
            .sort({ "notification.nextAttemptAt": 1, id: 1 });
        if (!candidate) break;
        const previous = candidate.notification!;
        const claim: Extract<FeedbackNotification, { kind: "sending" }> = {
            kind: "sending",
            attempts: previous.attempts + 1,
            attemptId: randomUUID(),
            recipient: settings.recipient,
            startedAt: at.toISOString(),
            leaseUntil: new Date(at.getTime() + 180000).toISOString(),
        };
        const record = await model.findOneAndUpdate(
            { ...candidates, id: candidate.id, notification: previous },
            { $set: { notification: claim } },
            { new: true },
        );
        if (!record) continue; // another worker or operator won the compare-and-set
        // Closing/deleting before transport begins prevents sending. A send already
        // in progress cannot be retracted; its result is still recorded truthfully.
        if (
            !(await model.exists({
                domain: domain._id,
                id: record.id,
                state: "open",
                "notification.attemptId": claim.attemptId,
            }))
        ) {
            await model.updateOne(
                {
                    domain: domain._id,
                    id: record.id,
                    "notification.attemptId": claim.attemptId,
                },
                { $set: { notification: previous } },
            );
            continue;
        }
        let result: FeedbackMailResult;
        try {
            result = await send(record, claim, domain);
        } catch {
            result = { kind: "uncertain" };
        }
        // Failure to save the outcome leaves the lease to become uncertain, never
        // requeues a message whose SMTP acceptance might already have happened.
        await model.updateOne(
            {
                domain: domain._id,
                id: record.id,
                "notification.kind": "sending",
                "notification.attemptId": claim.attemptId,
            },
            {
                $set: {
                    notification: completedFeedbackNotification(
                        claim,
                        result,
                        now(),
                    ),
                },
            },
        );
    }
}
