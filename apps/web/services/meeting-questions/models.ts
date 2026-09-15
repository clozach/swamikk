import mongoose from "mongoose";
import {
    MeetingQuestionSetSchema,
    MeetingQuestionAnswerSchema,
    type InternalMeetingQuestionSet,
    type InternalMeetingQuestionAnswer,
} from "@courselit/orm-models";

export const MeetingQuestionSetModel =
    (mongoose.models
        .MeetingQuestionSet as mongoose.Model<InternalMeetingQuestionSet>) ||
    mongoose.model<InternalMeetingQuestionSet>(
        "MeetingQuestionSet",
        MeetingQuestionSetSchema,
    );
export const MeetingQuestionAnswerModel =
    (mongoose.models
        .MeetingQuestionAnswer as mongoose.Model<InternalMeetingQuestionAnswer>) ||
    mongoose.model<InternalMeetingQuestionAnswer>(
        "MeetingQuestionAnswer",
        MeetingQuestionAnswerSchema,
    );
