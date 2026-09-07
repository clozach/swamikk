import mongoose, { Model } from "mongoose";
import { EmailDeliverySchema } from "@courselit/orm-models";
type EmailDeliveryRecord = mongoose.InferSchemaType<typeof EmailDeliverySchema>;
const EmailDeliveryModel =
    (mongoose.models.EmailDelivery as Model<EmailDeliveryRecord>) ||
    mongoose.model<EmailDeliveryRecord>("EmailDelivery", EmailDeliverySchema);
export default EmailDeliveryModel;
