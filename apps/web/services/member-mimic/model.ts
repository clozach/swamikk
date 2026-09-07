import mongoose from "mongoose";
import {
    MemberMimicSchema,
    type InternalMemberMimic,
} from "@courselit/orm-models";

export const MemberMimicModel =
    (mongoose.models.MemberMimic as mongoose.Model<InternalMemberMimic>) ||
    mongoose.model<InternalMemberMimic>("MemberMimic", MemberMimicSchema);
