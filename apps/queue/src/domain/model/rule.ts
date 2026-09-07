import mongoose, { Model } from "mongoose";
import { RuleSchema } from "@courselit/orm-models";
type RuleRecord = mongoose.InferSchemaType<typeof RuleSchema>;
const RuleModel =
    (mongoose.models.Rule as Model<RuleRecord>) ||
    mongoose.model<RuleRecord>("Rule", RuleSchema);
export default RuleModel;
