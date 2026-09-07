import mongoose from "mongoose";
import {
    DripChangeSchema,
    type InternalDripChange,
} from "../../../../packages/orm-models/src/models/drip-change";

export const DripChangeModel =
    (mongoose.models.DripChange as mongoose.Model<InternalDripChange>) ||
    mongoose.model<InternalDripChange>("DripChange", DripChangeSchema);
