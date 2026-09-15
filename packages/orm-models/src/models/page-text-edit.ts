import type { TextEdit } from "@courselit/common-models";
import mongoose from "mongoose";

/** Committed alongside the source write; retained until history is durable. */
export type PageTextEditReceipt = { editId: string; revision: number };
export const PageTextEditReceiptSchema =
    new mongoose.Schema<PageTextEditReceipt>(
        {
            editId: { type: String, required: true },
            revision: { type: Number, required: true },
        },
        { _id: false },
    );

/**
 * Append-only history of inline text edits. A row is written before the
 * page/site write and settled after it, so every attempt leaves a record;
 * only `applied` rows are shown as history. Nothing here is ever updated
 * except that settlement.
 */
export type InternalPageTextEdit = TextEdit & {
    domain: mongoose.Types.ObjectId;
    pageId: string;
    /** Immutable Page or Domain identity; absent on pre-receipt history. */
    sourceDocumentId?: string;
    before?: string;
    after?: string;
    state: "applying" | "applied" | "failed";
    failureReason?: string;
    createdAt: Date;
    updatedAt: Date;
};

export const PageTextEditSchema = new mongoose.Schema<InternalPageTextEdit>(
    {
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        editId: { type: String, required: true },
        pageId: { type: String, required: true },
        sourceDocumentId: String,
        target: { type: mongoose.Schema.Types.Mixed, required: true },
        widgetName: { type: String, required: true },
        /** The edit's changes (text leaves and rich-text nodes), applied together. */
        changes: { type: mongoose.Schema.Types.Mixed, required: true },
        /** First-increment rows carried one string change at the top level; read-only now. */
        before: { type: String, maxlength: 20000 },
        after: { type: String, maxlength: 20000 },
        userId: { type: String, required: true },
        at: { type: String, required: true },
        revision: { type: Number, required: true, default: 0 },
        undoOf: String,
        state: {
            type: String,
            required: true,
            enum: ["applying", "applied", "failed"],
        },
        failureReason: String,
    },
    { timestamps: true },
);
PageTextEditSchema.index({ domain: 1, editId: 1 }, { unique: true });
PageTextEditSchema.index({ domain: 1, pageId: 1, state: 1, at: -1 });
PageTextEditSchema.index({ domain: 1, "target.kind": 1, state: 1, at: -1 });
// No TTL: the history is the durable way back.
