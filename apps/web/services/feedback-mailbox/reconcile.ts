import { z } from "zod";
import type { FeedbackNotification } from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import { FeedbackModel } from "@/services/content-changes/models";
import { feedbackView } from "@/services/content-changes/feedback";
import { requireFeedbackAdmin } from "@/services/content-changes/http";
import { requireCondition } from "@/services/content-changes/errors";

export const mailboxActionInput = z
    .object({
        action: z.enum(["retry", "confirm-received", "confirm-not-sent"]),
        expectedUpdatedAt: z.string().datetime(),
        verified: z.boolean().optional(),
    })
    .strict();

export async function reconcileFeedbackNotification(
    id: string,
    raw: unknown,
    ctx: GQLContext,
) {
    requireFeedbackAdmin(ctx);
    const input = mailboxActionInput.parse(raw);
    const record = await FeedbackModel.findOne({
        domain: ctx.subdomain._id,
        id,
    });
    requireCondition(record, "not_found", "Feedback not found.", 404);
    requireCondition(
        record.updatedAt.toISOString() === input.expectedUpdatedAt,
        "conflict",
        "Delivery status changed. Refresh before acting.",
        409,
    );
    const current = record.notification;
    let notification: FeedbackNotification;
    if (input.action === "retry") {
        requireCondition(
            record.state === "open" && (!current || current.kind === "failed"),
            "conflict",
            "Only open feedback with a definite delivery failure can be queued again.",
            409,
        );
        notification = {
            kind: "pending",
            attempts: 0,
            nextAttemptAt: new Date().toISOString(),
        };
    } else {
        requireCondition(
            current?.kind === "uncertain" && input.verified === true,
            "conflict",
            "Check the mailbox or provider log and explicitly confirm the outcome first.",
            409,
        );
        if (input.action === "confirm-received") {
            notification = {
                kind: "accepted",
                attempts: current.attempts,
                attemptId: current.attemptId,
                recipient: current.recipient,
                acceptedAt: new Date().toISOString(),
                evidence: "operator",
            };
        } else {
            requireCondition(
                record.state === "open",
                "conflict",
                "Reopen feedback before queuing a confirmed unsent notification.",
                409,
            );
            notification = {
                kind: "pending",
                attempts: 0,
                nextAttemptAt: new Date().toISOString(),
            };
        }
    }
    const updated = await FeedbackModel.findOneAndUpdate(
        {
            domain: ctx.subdomain._id,
            id,
            updatedAt: new Date(input.expectedUpdatedAt),
        },
        {
            $set: {
                notification,
                notificationReview: {
                    action: input.action,
                    by: ctx.user!.userId,
                    at: new Date().toISOString(),
                },
            },
        },
        { new: true },
    );
    requireCondition(
        updated,
        "conflict",
        "Delivery status changed. Refresh before acting.",
        409,
    );
    return { feedback: feedbackView(updated, true) };
}
