import type { ContentChange } from "@courselit/common-models";
import mongoose from "mongoose";

export interface InternalContentChange
    extends Omit<ContentChange, "createdAt" | "updatedAt"> {
    domain: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
    /** Derived lock: present only while an application has no settled outcome. */
    activeTarget?: string;
}

export const ContentChangeSchema = new mongoose.Schema<InternalContentChange>(
    {
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        id: { type: String, required: true },
        target: { type: mongoose.Schema.Types.Mixed, required: true },
        feedbackId: String,
        reversesChangeId: String,
        version: { type: Number, required: true, min: 1 },
        summary: { type: String, required: true, maxlength: 2000 },
        patch: { type: mongoose.Schema.Types.Mixed, required: true },
        baseline: { type: mongoose.Schema.Types.Mixed, required: true },
        preview: { type: mongoose.Schema.Types.Mixed, required: true },
        previewHash: { type: String, required: true },
        preparedBy: { type: String, required: true },
        preparedAt: { type: String, required: true },
        state: { type: mongoose.Schema.Types.Mixed, required: true },
        history: { type: mongoose.Schema.Types.Mixed, default: [] },
        approvals: { type: mongoose.Schema.Types.Mixed, default: [] },
        activeTarget: String,
    },
    { timestamps: true },
);
ContentChangeSchema.index({ domain: 1, id: 1 }, { unique: true });
ContentChangeSchema.index({ domain: 1, createdAt: -1, id: 1 });
// One unsettled operation per target. A crash retains this lock until reconciliation.
ContentChangeSchema.index(
    { domain: 1, activeTarget: 1 },
    {
        unique: true,
        partialFilterExpression: { activeTarget: { $type: "string" } },
    },
);
// No TTL: applied baselines support recovery; unresolved applications must retain receipts.
