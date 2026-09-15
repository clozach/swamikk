import type {
    SectionEdit,
    SectionEditState,
    SectionSnapshot,
} from "@courselit/common-models";
import mongoose from "mongoose";

/** Immutable attempt payload; only settlement changes. No TTL: this is the way back. */
export type InternalSectionEdit = SectionEdit & {
    domain: mongoose.Types.ObjectId;
    inputHash: string;
    baselineFingerprint: string;
    baselineRevision: number;
    snapshot: SectionSnapshot;
    state: SectionEditState;
    createdAt: Date;
    updatedAt: Date;
};
export const SectionEditSchema = new mongoose.Schema<InternalSectionEdit>(
    {
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        editId: { type: String, required: true },
        target: { type: mongoose.Schema.Types.Mixed, required: true },
        action: { type: String, enum: ["remove", "restore"], required: true },
        widgetName: { type: String, required: true },
        label: { type: String, required: true },
        widget: { type: mongoose.Schema.Types.Mixed, required: true },
        position: { type: mongoose.Schema.Types.Mixed, required: true },
        userId: { type: String, required: true },
        at: { type: String, required: true },
        revision: { type: Number, required: true },
        undoOf: String,
        inputHash: { type: String, required: true },
        baselineFingerprint: { type: String, required: true },
        baselineRevision: { type: Number, required: true },
        snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
        state: { type: mongoose.Schema.Types.Mixed, required: true },
    },
    { timestamps: true },
);
SectionEditSchema.index({ domain: 1, editId: 1 }, { unique: true });
SectionEditSchema.index({
    domain: 1,
    "target.documentId": 1,
    "state.kind": 1,
    at: -1,
    editId: 1,
});
