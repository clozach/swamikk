import mongoose from "mongoose";
import type { DripChange } from "../../../common-models/src/drip-change";

export interface InternalDripChange
    extends Omit<DripChange, "createdAt" | "updatedAt"> {
    domain: mongoose.Types.ObjectId;
    baseline: { revision: number; groups: unknown[]; fingerprint: string };
    proposedGroups: unknown[];
    activeCourse?: string;
    createdAt: Date;
    updatedAt: Date;
}

export const DripChangeSchema = new mongoose.Schema<InternalDripChange>(
    {
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        id: { type: String, required: true },
        courseId: { type: String, required: true },
        version: { type: Number, required: true, min: 1 },
        patch: { type: mongoose.Schema.Types.Mixed, required: true },
        preview: { type: mongoose.Schema.Types.Mixed, required: true },
        previewHash: { type: String, required: true },
        preparedBy: { type: String, required: true },
        preparedAt: { type: String, required: true },
        state: { type: mongoose.Schema.Types.Mixed, required: true },
        history: { type: mongoose.Schema.Types.Mixed, default: [] },
        restoresChangeId: String,
        baseline: { type: mongoose.Schema.Types.Mixed, required: true },
        proposedGroups: { type: mongoose.Schema.Types.Mixed, required: true },
        activeCourse: String,
    },
    { timestamps: true },
);
DripChangeSchema.index({ domain: 1, id: 1 }, { unique: true });
DripChangeSchema.index({ domain: 1, courseId: 1, createdAt: -1 });
DripChangeSchema.index(
    { domain: 1, activeCourse: 1 },
    {
        unique: true,
        partialFilterExpression: { activeCourse: { $type: "string" } },
    },
);
// No TTL: unresolved operations and applied baselines are needed for recovery.
