import {
    InternalMediaDeletionCandidate,
    MediaDeletionCandidateSchema,
} from "@courselit/orm-models";
import mongoose, { Model } from "mongoose";

const MediaDeletionCandidateModel =
    (mongoose.models.MediaDeletionCandidate as
        | Model<InternalMediaDeletionCandidate>
        | undefined) ||
    mongoose.model<InternalMediaDeletionCandidate>(
        "MediaDeletionCandidate",
        MediaDeletionCandidateSchema,
    );

export default MediaDeletionCandidateModel;
