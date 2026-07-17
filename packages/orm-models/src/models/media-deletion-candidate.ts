import mongoose from "mongoose";

export const mediaDeletionPending = "pending" as const;
export const mediaDeletionInProgress = "deleting" as const;
export const mediaDeletionGracePeriodMs = 24 * 60 * 60 * 1000;
export const mediaDeletionStatuses = [
    mediaDeletionPending,
    mediaDeletionInProgress,
] as const;

export type MediaDeletionStatus = (typeof mediaDeletionStatuses)[number];

export interface InternalMediaDeletionCandidate {
    _id: mongoose.Types.ObjectId;
    domain: mongoose.Types.ObjectId;
    mediaId: string;
    deleteAfter: Date;
    status: MediaDeletionStatus;
    claimedAt?: Date;
    rescheduleRequested: boolean;
    attempts: number;
    lastError?: string;
    createdAt: Date;
    updatedAt: Date;
}

export const MediaDeletionCandidateSchema =
    new mongoose.Schema<InternalMediaDeletionCandidate>(
        {
            domain: { type: mongoose.Schema.Types.ObjectId, required: true },
            mediaId: { type: String, required: true },
            deleteAfter: { type: Date, required: true },
            status: {
                type: String,
                required: true,
                enum: mediaDeletionStatuses,
                default: mediaDeletionPending,
            },
            claimedAt: Date,
            rescheduleRequested: {
                type: Boolean,
                required: true,
                default: true,
            },
            attempts: { type: Number, required: true, default: 0 },
            lastError: String,
        },
        { timestamps: true },
    );

MediaDeletionCandidateSchema.index({ domain: 1, mediaId: 1 }, { unique: true });
MediaDeletionCandidateSchema.index({ status: 1, deleteAfter: 1 });
