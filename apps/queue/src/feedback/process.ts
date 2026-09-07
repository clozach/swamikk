import mongoose from "mongoose";
import {
    DomainSchema,
    FeedbackSchema,
    type Domain,
    type InternalFeedback,
} from "@courselit/orm-models";
import {
    processFeedbackMailboxDomain,
    validMailboxSettings,
} from "@courselit/common-logic";
import { sendFeedbackNotification } from "./transport";
import { logger } from "../logger";

const Feedback: mongoose.Model<InternalFeedback> =
    (mongoose.models.ContextualFeedback as mongoose.Model<InternalFeedback>) ||
    mongoose.model<InternalFeedback>("ContextualFeedback", FeedbackSchema);
// Lean queries retain fields even if an older queue consumer registered Domain
// using its narrower schema first. All writes remain tenant-scoped to feedback.
const Domains: mongoose.Model<Domain> =
    (mongoose.models.Domain as mongoose.Model<Domain>) ||
    mongoose.model<Domain>("Domain", DomainSchema);

export async function collectFeedbackNotifications() {
    const domains = Domains.find({
        deleted: { $ne: true },
        "settings.feedbackMailbox": { $exists: true },
    })
        .select("_id name customDomain settings.feedbackMailbox")
        .lean()
        .cursor();
    for await (const domain of domains) {
        try {
            await processFeedbackMailboxDomain({
                model: Feedback,
                domain,
                send: async (record, claim, target) => {
                    const latest = await Domains.findById(target._id)
                        .select("deleted settings.feedbackMailbox")
                        .lean();
                    const config = latest?.settings?.feedbackMailbox;
                    if (
                        !latest ||
                        latest.deleted ||
                        !validMailboxSettings(config) ||
                        config.recipient !== claim.recipient
                    )
                        return {
                            kind: "not-accepted",
                            reason: "configuration",
                            retryable: false,
                        };
                    return sendFeedbackNotification(record, claim, target);
                },
            });
        } catch {
            logger.error(
                { source: "feedback.mailbox", domainId: String(domain._id) },
                "Feedback notification processing failed; saved feedback remains available.",
            );
        }
    }
}

export async function processFeedbackMailbox() {
    // Uses the existing queue service lifecycle; a restart resumes Mongo intent.
    while (true) {
        try {
            await collectFeedbackNotifications();
        } catch {
            logger.error(
                { source: "feedback.mailbox" },
                "Feedback mailbox scan unavailable; retrying next minute.",
            );
        }
        await new Promise((resolve) => setTimeout(resolve, 60000));
    }
}
