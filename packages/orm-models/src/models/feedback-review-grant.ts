import mongoose from "mongoose";
import type { FeedbackReviewScope } from "@courselit/common-models";
export interface InternalFeedbackReviewGrant {
    domain: mongoose.Types.ObjectId;
    id: string;
    name: string;
    tokenHash: string;
    issuerUserId: string;
    scopes: FeedbackReviewScope[];
    expiresAt: Date;
    state:
        | { kind: "active" }
        | { kind: "revoking" | "revoked"; at: string; by: string };
    operations: { id: string; purpose: string; startedAt: Date }[];
    createdAt: Date;
    updatedAt: Date;
}
export const FeedbackReviewGrantSchema =
    new mongoose.Schema<InternalFeedbackReviewGrant>(
        {
            domain: { type: mongoose.Schema.Types.ObjectId, required: true },
            id: { type: String, required: true },
            name: { type: String, required: true, maxlength: 80 },
            tokenHash: { type: String, required: true, select: false },
            issuerUserId: { type: String, required: true },
            scopes: {
                type: [String],
                required: true,
                enum: ["public-page-text", "public-lesson-text"],
            },
            expiresAt: { type: Date, required: true },
            state: { type: mongoose.Schema.Types.Mixed, required: true },
            operations: {
                type: [
                    new mongoose.Schema(
                        {
                            id: { type: String, required: true },
                            purpose: { type: String, required: true },
                            startedAt: { type: Date, required: true },
                        },
                        { _id: false },
                    ),
                ],
                default: [],
            },
        },
        { timestamps: true },
    );
FeedbackReviewGrantSchema.index({ domain: 1, id: 1 }, { unique: true });
// No TTL: revocation and interrupted-operation evidence must survive credential expiry.
