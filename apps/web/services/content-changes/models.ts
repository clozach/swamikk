import mongoose from "mongoose";
import {
    ContentChangeSchema,
    FeedbackSchema,
    FeedbackRateLimitSchema,
    type InternalContentChange,
    type InternalFeedback,
    type InternalFeedbackRateLimit,
} from "@courselit/orm-models";

export const ContentChangeModel =
    (mongoose.models.ContentChange as mongoose.Model<InternalContentChange>) ||
    mongoose.model<InternalContentChange>("ContentChange", ContentChangeSchema);
export const FeedbackModel =
    (mongoose.models.ContextualFeedback as mongoose.Model<InternalFeedback>) ||
    mongoose.model<InternalFeedback>("ContextualFeedback", FeedbackSchema);
export const FeedbackRateLimitModel =
    (mongoose.models
        .FeedbackRateLimit as mongoose.Model<InternalFeedbackRateLimit>) ||
    mongoose.model<InternalFeedbackRateLimit>(
        "FeedbackRateLimit",
        FeedbackRateLimitSchema,
    );
