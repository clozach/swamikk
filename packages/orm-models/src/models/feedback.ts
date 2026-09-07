import type { ContextualFeedback } from "@courselit/common-models";
import mongoose from "mongoose";

export interface InternalFeedback
    extends Omit<ContextualFeedback, "createdAt" | "updatedAt"> {
    domain: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
    expiresAt?: Date;
    automaticReview?: import("@courselit/common-models").FeedbackReviewState;
    notificationReview?: { action: string; by: string; at: string };
}

export const FeedbackSchema = new mongoose.Schema<InternalFeedback>(
    {
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        id: { type: String, required: true },
        text: { type: String, required: true, maxlength: 4000 },
        target: { type: mongoose.Schema.Types.Mixed, required: true },
        actor: { type: mongoose.Schema.Types.Mixed, required: true },
        photoMediaIds: { type: [String], default: [] },
        state: { type: String, enum: ["open", "closed"], required: true },
        notification: { type: mongoose.Schema.Types.Mixed },
        automaticReview: { type: mongoose.Schema.Types.Mixed },
        notificationReview: { type: mongoose.Schema.Types.Mixed },
        expiresAt: Date,
    },
    { timestamps: true },
);
FeedbackSchema.index({ domain: 1, id: 1 }, { unique: true });
FeedbackSchema.index({ domain: 1, createdAt: -1, id: 1 });
FeedbackSchema.index({
    domain: 1,
    "notification.kind": 1,
    "notification.nextAttemptAt": 1,
});
FeedbackSchema.index({
    domain: 1,
    "notification.kind": 1,
    "notification.leaseUntil": 1,
});
FeedbackSchema.index({ domain: 1, "actor.userId": 1, createdAt: -1 });
// Open feedback has no expiry. Closing schedules removal after 90 days.
FeedbackSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export interface InternalFeedbackRateLimit {
    key: string;
    count: number;
    expiresAt: Date;
}

export const FeedbackRateLimitSchema =
    new mongoose.Schema<InternalFeedbackRateLimit>({
        key: { type: String, required: true },
        count: { type: Number, required: true },
        expiresAt: { type: Date, required: true },
    });
FeedbackRateLimitSchema.index({ key: 1 }, { unique: true });
FeedbackRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

FeedbackSchema.index({
    domain: 1,
    "automaticReview.kind": 1,
    "automaticReview.leaseUntil": 1,
});
