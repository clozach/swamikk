import type {
    MemberEdit,
    MemberEditField,
    MemberEditState,
} from "@courselit/common-models";
import mongoose from "mongoose";

/**
 * Append-only history of member edits made from Member Mimic. A row is
 * written `applying` before the record write and settled `applied` or
 * `failed` after it; an email change to a never-held address starts as
 * `pending` and carries its hashed code until the code is confirmed. The
 * editor's name and email are resolved on read from the users collection
 * and never copied here. Original change values stay fixed; state and email
 * delivery status settle separately. Source-document receipts recover writes
 * whose history settlement or notification was interrupted.
 */
export type InternalMemberEdit = Omit<MemberEdit, "editor"> & {
    domain: mongoose.Types.ObjectId;
    state: MemberEditState;
    failureReason?: string;
    emailEffects?: "pending" | "complete";
    /** Pending email changes only; never returned. */
    codeHash?: string;
    codeSalt?: string;
    attempts?: number;
    resends?: number;
    expiresAt?: Date;
    createdAt: Date;
    updatedAt: Date;
};

const memberEditFields: readonly MemberEditField[] = [
    "name",
    "email",
    "contact.kind",
    "contact.value",
    "checkIns",
];

const MemberEditChangeSchema = new mongoose.Schema(
    {
        field: { type: String, required: true, enum: memberEditFields },
        // An empty string is a legitimate before/after (a member without a name).
        before: { type: String, maxlength: 254, default: "" },
        after: { type: String, maxlength: 254, default: "" },
    },
    { _id: false },
);

const MemberEmailVerificationSchema = new mongoose.Schema(
    {
        kind: {
            type: String,
            required: true,
            enum: ["code-to-new-address", "previously-held"],
        },
    },
    { _id: false },
);

export const MemberEditSchema = new mongoose.Schema<InternalMemberEdit>(
    {
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        editId: { type: String, required: true },
        subjectUserId: { type: String, required: true },
        editorUserId: { type: String, required: true },
        mimicId: { type: String, required: true },
        at: { type: String, required: true },
        changes: { type: [MemberEditChangeSchema], required: true },
        undoOf: String,
        emailVerification: {
            type: MemberEmailVerificationSchema,
            required: false,
        },
        state: {
            type: String,
            required: true,
            enum: ["pending", "applying", "applied", "failed"],
        },
        failureReason: String,
        emailEffects: { type: String, enum: ["pending", "complete"] },
        codeHash: String,
        codeSalt: String,
        attempts: Number,
        resends: Number,
        expiresAt: Date,
    },
    { timestamps: true },
);
MemberEditSchema.index({ domain: 1, editId: 1 }, { unique: true });
MemberEditSchema.index({ domain: 1, subjectUserId: 1, state: 1, at: -1 });
MemberEditSchema.index({ domain: 1, subjectUserId: 1, state: 1, expiresAt: 1 });
MemberEditSchema.index(
    { domain: 1, subjectUserId: 1, editorUserId: 1, state: 1 },
    { unique: true, partialFilterExpression: { state: "pending" } },
);
// No TTL: the history is the durable way back.
