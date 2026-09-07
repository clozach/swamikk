import mongoose, { Model } from "mongoose";
import { SequenceSchema } from "@courselit/orm-models";
type SequenceRecord = mongoose.InferSchemaType<typeof SequenceSchema>;
const SequenceModel =
    (mongoose.models.Sequence as Model<SequenceRecord>) ||
    mongoose.model<SequenceRecord>("Sequence", SequenceSchema);
export default SequenceModel;
