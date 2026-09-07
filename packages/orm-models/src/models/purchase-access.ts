import mongoose from "mongoose";
import type { PurchaseAccess } from "../../../common-models/src/purchase-access";

export interface InternalPurchaseAccess
    extends Omit<PurchaseAccess, "domainId"> {
    domain: mongoose.Types.ObjectId;
}
export const PurchaseAccessSchema = new mongoose.Schema<InternalPurchaseAccess>(
    {
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        userId: { type: String, required: true },
        courseId: { type: String, required: true },
        membershipId: { type: String, required: true },
        membershipSessionId: { type: String, required: true },
        state: {
            type: String,
            enum: ["open", "ending", "ended"],
            required: true,
        },
        proof: mongoose.Schema.Types.Mixed,
        writes: { type: mongoose.Schema.Types.Mixed, default: [] },
        observation: mongoose.Schema.Types.Mixed,
        financialReviewRequired: Boolean,
        bookingReviewRequired: Boolean,
        endedAt: Date,
        updatedAt: { type: Date, required: true },
    },
);
PurchaseAccessSchema.index(
    { domain: 1, membershipId: 1, membershipSessionId: 1 },
    { unique: true },
);
PurchaseAccessSchema.index({ domain: 1, userId: 1, courseId: 1 });
