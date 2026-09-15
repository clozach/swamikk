import mongoose from "mongoose";
import {
    SectionEditSchema,
    type InternalSectionEdit,
} from "@courselit/orm-models";

export const SectionEditModel =
    (mongoose.models.SectionEdit as mongoose.Model<InternalSectionEdit>) ||
    mongoose.model<InternalSectionEdit>("SectionEdit", SectionEditSchema);
