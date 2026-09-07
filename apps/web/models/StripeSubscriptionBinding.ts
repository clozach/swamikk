import mongoose from "mongoose";
import {
    StripeSubscriptionBindingSchema,
    type InternalStripeSubscriptionBinding,
} from "../../../packages/orm-models/src/models/stripe-lifecycle";
export type { InternalStripeSubscriptionBinding };
export default (mongoose.models.StripeSubscriptionBinding as
    | mongoose.Model<InternalStripeSubscriptionBinding>
    | undefined) ||
    mongoose.model<InternalStripeSubscriptionBinding>(
        "StripeSubscriptionBinding",
        StripeSubscriptionBindingSchema,
    );
