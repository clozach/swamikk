import mongoose from "mongoose";
import {
    StripeWebhookReceiptSchema,
    type InternalStripeWebhookReceipt,
} from "../../../packages/orm-models/src/models/stripe-lifecycle";
export default (mongoose.models.StripeWebhookReceipt as
    | mongoose.Model<InternalStripeWebhookReceipt>
    | undefined) ||
    mongoose.model<InternalStripeWebhookReceipt>(
        "StripeWebhookReceipt",
        StripeWebhookReceiptSchema,
    );
