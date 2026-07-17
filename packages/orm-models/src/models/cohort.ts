import type { Cohort } from "@courselit/common-models";
import { generateUniqueId } from "@courselit/utils";
import mongoose from "mongoose";

export interface InternalCohort extends Cohort {
    domain: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

export const CohortSchema = new mongoose.Schema<InternalCohort>(
    {
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        cohortId: {
            type: String,
            required: true,
            unique: true,
            default: generateUniqueId,
        },
        name: { type: String, required: true },
        courseId: { type: String, required: true },
        members: { type: [String], default: [] },
        schedule: new mongoose.Schema(
            {
                startAt: { type: Date },
                endAt: { type: Date },
            },
            { _id: false },
        ),
    },
    {
        timestamps: true,
    },
);

CohortSchema.index({ domain: 1, courseId: 1, name: 1 }, { unique: true });
