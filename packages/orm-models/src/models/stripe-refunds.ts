import mongoose from "mongoose";
import type { StripeChargeRefunds } from "../../../common-models/src/stripe-refunds";

export interface InternalStripeChargeRefunds extends StripeChargeRefunds {
    _id: mongoose.Types.ObjectId;
    domain: mongoose.Types.ObjectId;
}
export const StripeChargeRefundsSchema =
    new mongoose.Schema<InternalStripeChargeRefunds>(
        {
            domain: { type: mongoose.Schema.Types.ObjectId, required: true },
            mode: { type: String, enum: ["test", "live"], required: true },
            chargeId: { type: String, required: true },
            paymentIntentId: { type: String, required: true },
            customerId: { type: String, default: null },
            providerInvoiceId: { type: String, default: null },
            invoiceId: { type: String, required: true },
            nativeTransactionId: { type: String, required: true },
            membershipId: { type: String, required: true },
            membershipSessionId: { type: String, required: true },
            userId: { type: String, required: true },
            currency: { type: String, required: true },
            chargedAmount: { type: Number, required: true },
            state: { type: mongoose.Schema.Types.Mixed, required: true },
            claim: { type: mongoose.Schema.Types.Mixed },
            revision: { type: Number, required: true, default: 0 },
        },
        { timestamps: true },
    );
StripeChargeRefundsSchema.index(
    { domain: 1, mode: 1, chargeId: 1 },
    { unique: true },
);
StripeChargeRefundsSchema.index({ domain: 1, invoiceId: 1 }, { unique: true });
StripeChargeRefundsSchema.index({
    domain: 1,
    userId: 1,
    membershipSessionId: 1,
});
