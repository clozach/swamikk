import mongoose from "mongoose";
import {
    FeedbackReviewGrantSchema,
    type InternalFeedbackReviewGrant,
} from "@courselit/orm-models";
export const ReviewGrantModel =
    (mongoose.models
        .FeedbackReviewGrant as mongoose.Model<InternalFeedbackReviewGrant>) ||
    mongoose.model<InternalFeedbackReviewGrant>(
        "FeedbackReviewGrant",
        FeedbackReviewGrantSchema,
    );
