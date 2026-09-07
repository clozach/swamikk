import mongoose from "mongoose";
import type {
    StripeSubscriptionBinding,
    StripeWebhookReceipt,
} from "../../../common-models/src/stripe-lifecycle";

export interface InternalStripeSubscriptionBinding
    extends StripeSubscriptionBinding {
    _id: mongoose.Types.ObjectId;
    domain: mongoose.Types.ObjectId;
}
export const StripeSubscriptionBindingSchema =
    new mongoose.Schema<InternalStripeSubscriptionBinding>(
        {
            domain: { type: mongoose.Schema.Types.ObjectId, required: true },
            subscriptionId: { type: String, required: true },
            mode: { type: String, enum: ["test", "live"], required: true },
            membershipId: { type: String, required: true },
            membershipSessionId: { type: String, required: true },
            userId: { type: String, required: true },
            paymentPlanId: { type: String, required: true },
            planType: { type: String, required: true },
            originalInvoiceId: { type: String, required: true },
            customerId: { type: String, required: true },
            includedMembershipIds: { type: [String], default: [] },
            state: { type: mongoose.Schema.Types.Mixed, required: true },
            claim: { type: mongoose.Schema.Types.Mixed },
            revision: { type: Number, default: 0, required: true },
        },
        { timestamps: true },
    );
StripeSubscriptionBindingSchema.index(
    { domain: 1, mode: 1, subscriptionId: 1 },
    { unique: true },
);
StripeSubscriptionBindingSchema.index({
    domain: 1,
    userId: 1,
    membershipSessionId: 1,
    paymentPlanId: 1,
});

export interface InternalStripeWebhookReceipt extends StripeWebhookReceipt {
    domain: mongoose.Types.ObjectId;
}
export const StripeWebhookReceiptSchema =
    new mongoose.Schema<InternalStripeWebhookReceipt>(
        {
            domain: { type: mongoose.Schema.Types.ObjectId, required: true },
            eventId: { type: String, required: true },
            type: { type: String, required: true },
            objectId: { type: String, required: true },
            mode: { type: String, enum: ["test", "live"], required: true },
            state: { type: mongoose.Schema.Types.Mixed, required: true },
        },
        { timestamps: true },
    );
StripeWebhookReceiptSchema.index(
    { domain: 1, mode: 1, eventId: 1 },
    { unique: true },
);
