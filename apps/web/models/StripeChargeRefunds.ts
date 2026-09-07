import mongoose from "mongoose";
import {
    StripeChargeRefundsSchema,
    type InternalStripeChargeRefunds,
} from "../../../packages/orm-models/src/models/stripe-refunds";
export type { InternalStripeChargeRefunds };
export default (mongoose.models.StripeChargeRefunds as
    | mongoose.Model<InternalStripeChargeRefunds>
    | undefined) ||
    mongoose.model<InternalStripeChargeRefunds>(
        "StripeChargeRefunds",
        StripeChargeRefundsSchema,
    );
