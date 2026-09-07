import type {
    ContentChange,
    LessonContentChange,
    PageWidgetContentChange,
} from "@courselit/common-models";
import mongoose from "mongoose";

export interface InternalContentChangeFields {
    domain: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
    activeTarget?: string;
}
export type InternalLessonContentChange = Omit<
    LessonContentChange,
    "createdAt" | "updatedAt"
> &
    InternalContentChangeFields;
export type InternalPageContentChange = Omit<
    PageWidgetContentChange,
    "createdAt" | "updatedAt"
> &
    InternalContentChangeFields;
export type InternalPageCreationChange = Omit<
    Extract<ContentChange, { target: { kind: "page-create" } }>,
    "createdAt" | "updatedAt"
> &
    InternalContentChangeFields;
export type InternalPagePublicationChange = Omit<
    Extract<ContentChange, { target: { kind: "page-publish" } }>,
    "createdAt" | "updatedAt"
> &
    InternalContentChangeFields;
export type InternalContentChange =
    | InternalLessonContentChange
    | InternalPageContentChange
    | InternalPageCreationChange
    | InternalPagePublicationChange;

export const ContentChangeSchema = new mongoose.Schema<InternalContentChange>(
    {
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        id: { type: String, required: true },
        target: { type: mongoose.Schema.Types.Mixed, required: true },
        feedbackId: String,
        provenance: { type: mongoose.Schema.Types.Mixed },
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
