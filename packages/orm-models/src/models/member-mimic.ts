import type { MemberMimicRecord } from "@courselit/common-models";
import mongoose from "mongoose";

export interface InternalMemberMimic extends MemberMimicRecord {
    domain: mongoose.Types.ObjectId;
    activeSessionKey?: string;
}

export const MemberMimicSchema = new mongoose.Schema<InternalMemberMimic>({
    domain: { type: mongoose.Schema.Types.ObjectId, required: true },
    id: { type: String, required: true },
    tokenHash: { type: String, required: true },
    actorUserId: { type: String, required: true },
    actorSessionHash: { type: String, required: true },
    subjectUserId: { type: String, required: true },
    returnTo: { type: String, required: true },
    state: { type: mongoose.Schema.Types.Mixed, required: true },
    activeSessionKey: String,
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    deleteAfter: { type: Date, required: true },
});
MemberMimicSchema.index({ tokenHash: 1 }, { unique: true });
MemberMimicSchema.index(
    { domain: 1, activeSessionKey: 1 },
    {
        unique: true,
        partialFilterExpression: { activeSessionKey: { $type: "string" } },
    },
);
MemberMimicSchema.index({ domain: 1, actorUserId: 1, createdAt: -1 });
MemberMimicSchema.index({ deleteAfter: 1 }, { expireAfterSeconds: 0 });
