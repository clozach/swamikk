import type {
    MeetingQuestionSetInput,
    MeetingAnswerHistoryEntry,
} from "@courselit/common-models";
import mongoose from "mongoose";

export interface InternalMeetingQuestionSet extends MeetingQuestionSetInput {
    domain: mongoose.Types.ObjectId;
    revision: number;
    contentHash: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface InternalMeetingQuestionAnswer {
    domain: mongoose.Types.ObjectId;
    id: string;
    setId: string;
    questionId: string;
    authorId?: string;
    text: string;
    revision: number;
    history: MeetingAnswerHistoryEntry[];
    createdAt: Date;
    updatedAt: Date;
}

export const MeetingQuestionSetSchema =
    new mongoose.Schema<InternalMeetingQuestionSet>(
        {
            domain: { type: mongoose.Schema.Types.ObjectId, required: true },
            id: { type: String, required: true },
            title: { type: String, required: true },
            intro: { type: String, default: "" },
            questions: { type: mongoose.Schema.Types.Mixed, required: true },
            revision: { type: Number, required: true },
            contentHash: { type: String, required: true },
        },
        { timestamps: true },
    );
MeetingQuestionSetSchema.index({ domain: 1, id: 1 }, { unique: true });

export const MeetingQuestionAnswerSchema =
    new mongoose.Schema<InternalMeetingQuestionAnswer>(
        {
            domain: { type: mongoose.Schema.Types.ObjectId, required: true },
            id: { type: String, required: true },
            setId: { type: String, required: true },
            questionId: { type: String, required: true },
            authorId: String,
            text: { type: String, default: "" },
            revision: { type: Number, required: true },
            history: { type: mongoose.Schema.Types.Mixed, required: true },
        },
        { timestamps: true },
    );
MeetingQuestionAnswerSchema.index({ domain: 1, id: 1 }, { unique: true });
MeetingQuestionAnswerSchema.index(
    { domain: 1, setId: 1, questionId: 1, authorId: 1 },
    {
        unique: true,
        partialFilterExpression: { authorId: { $type: "string" } },
    },
);
// Meeting records and every answer revision are retained; no feedback TTL/mailbox.
