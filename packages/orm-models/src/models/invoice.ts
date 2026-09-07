import { Constants, Invoice } from "@courselit/common-models";
import { generateUniqueId } from "@courselit/utils";
import mongoose from "mongoose";

export interface InternalInvoice extends Invoice {
    domain: mongoose.Types.ObjectId;
}

export const InvoiceSchema = new mongoose.Schema<InternalInvoice>(
    {
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        invoiceId: {
            type: String,
            required: true,
            unique: true,
            default: generateUniqueId,
        },
        membershipId: { type: String, required: true },
        membershipSessionId: { type: String, required: true },
        amount: { type: Number, required: true },
        status: {
            type: String,
            enum: Object.values(Constants.InvoiceStatus),
            default: Constants.InvoiceStatus.PENDING,
        },
        paymentProcessor: { type: String, required: true },
        paymentProcessorEntityId: { type: String },
        paymentMode: { type: String, enum: ["test", "live"] },
        settlement: {
            type: new mongoose.Schema(
                {
                    at: { type: Date, required: true },
                    source: {
                        type: String,
                        required: true,
                        enum: [
                            "stripe-invoice-paid",
                            "stripe-checkout-confirmed",
                        ],
                    },
                },
                { _id: false },
            ),
            required: false,
        },
        paymentProcessorTransactionId: { type: String },
        currencyISOCode: { type: String, required: true },
    },
    {
        timestamps: true,
    },
);
