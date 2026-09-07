import {
    Media,
    Quiz,
    TextEditorContent,
    ScormContent,
    LessonContentChangeReceipt,
    LessonPublication,
    LessonPublicationObservation,
} from "@courselit/common-models";
import { generateUniqueId } from "@courselit/utils";
import mongoose from "mongoose";
import constants from "../config/constants";
import MediaSchema from "./Media";
const { text, video, audio, pdf, quiz, file, embed, scorm } = constants;

export interface Lesson {
    id: mongoose.Types.ObjectId;
    domain: mongoose.Types.ObjectId;
    lessonId: string;
    title: string;
    type:
        | typeof text
        | typeof video
        | typeof audio
        | typeof pdf
        | typeof quiz
        | typeof file
        | typeof embed
        | typeof scorm;
    content?: Quiz | TextEditorContent | ScormContent | { value: string };
    media?: Media;
    downloadable: boolean;
    creatorId: string;
    courseId: string;
    requiresEnrollment: boolean;
    published: boolean;
    publication?: LessonPublication;
    publicationObservation?: LessonPublicationObservation;
    groupId: string;
    __v?: number;
    createdAt?: Date;
    updatedAt?: Date;
    contentChangeReceipt?: LessonContentChangeReceipt;
}

const LessonSchema = new mongoose.Schema<Lesson>(
    {
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        lessonId: { type: String, required: true, default: generateUniqueId },
        title: { type: String, required: true },
        type: {
            type: String,
            required: true,
            enum: [text, video, audio, pdf, quiz, file, embed, scorm],
        },
        content: { type: mongoose.Schema.Types.Mixed, default: {} },
        media: MediaSchema,
        downloadable: { type: Boolean, default: false },
        creatorId: { type: String, required: true },
        courseId: { type: String, required: true },
        requiresEnrollment: { type: Boolean, default: true },
        published: { type: Boolean, required: true, default: false },
        groupId: { type: String, required: true },
        publication: { type: mongoose.Schema.Types.Mixed, default: undefined },
        publicationObservation: {
            type: mongoose.Schema.Types.Mixed,
            default: undefined,
        },
        contentChangeReceipt: {
            type: new mongoose.Schema(
                {
                    outcome: { type: String, enum: ["applied", "cancelled"] },
                    operationId: String,
                    revision: Number,
                    appliedAt: String,
                },
                { _id: false },
            ),
            default: undefined,
        },
    },
    { optimisticConcurrency: true, timestamps: true },
);

export default mongoose.models.Lesson || mongoose.model("Lesson", LessonSchema);
