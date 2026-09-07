import mongoose, { type Model } from "mongoose";

export interface InternalRefundBookingEvidence {
    domain: mongoose.Types.ObjectId;
    invoiceId: string;
    membershipId: string;
    membershipSessionId: string;
    userId: string;
    courseId: string;
    cohortId: string;
    classStart: Date;
    source: "operator-verified" | "checkout";
    verifiedBy: string;
    explanation: string;
    verifiedAt: Date;
    revision: number;
    checkout?: {
        intentId: string;
        cohortDocumentId: string;
        fingerprint: string;
        selectedAt: Date;
    };
    verifications: Array<{
        cohortId: string;
        classStart: Date;
        verifiedBy: string;
        explanation: string;
        verifiedAt: Date;
    }>;
}
const schema = new mongoose.Schema<InternalRefundBookingEvidence>({
    domain: { type: mongoose.Schema.Types.ObjectId, required: true },
    invoiceId: { type: String, required: true },
    membershipId: { type: String, required: true },
    membershipSessionId: { type: String, required: true },
    userId: { type: String, required: true },
    courseId: { type: String, required: true },
    cohortId: { type: String, required: true },
    classStart: { type: Date, required: true },
    source: {
        type: String,
        enum: ["operator-verified", "checkout"],
        required: true,
    },
    verifiedBy: { type: String, required: true },
    explanation: { type: String, required: true },
    verifiedAt: { type: Date, required: true },
    revision: { type: Number, required: true, default: 0 },
    checkout: { type: mongoose.Schema.Types.Mixed },
    verifications: { type: mongoose.Schema.Types.Mixed, default: [] },
});
schema.index({ domain: 1, invoiceId: 1 }, { unique: true });
export default (mongoose.models.RefundBookingEvidence as
    | Model<InternalRefundBookingEvidence>
    | undefined) ||
    mongoose.model<InternalRefundBookingEvidence>(
        "RefundBookingEvidence",
        schema,
    );
