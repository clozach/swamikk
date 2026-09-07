import mongoose from "mongoose";
import type { BookedClass } from "@/services/class-checkout/types";
export type ClassIntentState =
    | { kind: "allocating" }
    | { kind: "creating"; firstAttemptAt: Date }
    | { kind: "allocation-failed"; failedAt: Date }
    | { kind: "not-started"; retiredAt: Date }
    | { kind: "uncertain"; firstAttemptAt: Date }
    | { kind: "ready"; firstAttemptAt: Date; checkoutUrl: string }
    | { kind: "completed"; paidAt: Date };
export interface InternalClassCheckoutIntent {
    domain: mongoose.Types.ObjectId;
    id: string;
    userId: string;
    courseId: string;
    planId: string;
    invoiceId: string;
    membershipId: string;
    membershipSessionId: string;
    booking: BookedClass;
    amount: number;
    currency: string;
    origin: string;
    state: ClassIntentState;
    createdAt: Date;
    updatedAt: Date;
}
const schema = new mongoose.Schema<InternalClassCheckoutIntent>(
    {
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        id: { type: String, required: true, unique: true },
        userId: { type: String, required: true },
        courseId: { type: String, required: true },
        planId: { type: String, required: true },
        invoiceId: { type: String, required: true, unique: true },
        membershipId: { type: String, required: true },
        membershipSessionId: { type: String, required: true },
        booking: { type: mongoose.Schema.Types.Mixed, required: true },
        amount: { type: Number, required: true },
        currency: { type: String, required: true },
        origin: { type: String, required: true },
        state: { type: mongoose.Schema.Types.Mixed, required: true },
    },
    { timestamps: true },
);
schema.index(
    { domain: 1, userId: 1, courseId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            "state.kind": {
                $in: [
                    "allocating",
                    "allocation-failed",
                    "creating",
                    "ready",
                    "uncertain",
                ],
            },
        },
    },
);
export default (mongoose.models.ClassCheckoutIntent as
    | mongoose.Model<InternalClassCheckoutIntent>
    | undefined) ||
    mongoose.model<InternalClassCheckoutIntent>("ClassCheckoutIntent", schema);
