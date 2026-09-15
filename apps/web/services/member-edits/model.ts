import mongoose from "mongoose";
import {
    MemberEditSchema,
    type InternalMemberEdit,
} from "@courselit/orm-models";

export const MemberEditModel =
    (mongoose.models.MemberEdit as mongoose.Model<InternalMemberEdit>) ||
    mongoose.model<InternalMemberEdit>("MemberEdit", MemberEditSchema);
