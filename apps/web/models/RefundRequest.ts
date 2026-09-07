import mongoose, { type Model } from "mongoose";
import type {
    PurchaseRefundQuote,
    PurchaseRefundResult,
} from "@/services/refund-requests/provider-types";
import type {
    RefundAccessDecision,
    RefundRouting,
} from "@/services/refund-requests/types";

export interface InternalRefundRequest {
    domain: mongoose.Types.ObjectId;
    requestId: string;
    invoiceId: string;
    membershipId: string;
    membershipSessionId: string;
    userId: string;
    productName: string;
    reason: string;
    state:
        | "draft"
        | "submitted"
        | "approved"
        | "declined"
        | "complete"
        | "review-required";
    routing: RefundRouting;
    assignedTo: "Al" | "KK";
    quote?: PurchaseRefundQuote;
    quoteExpiresAt?: Date;
    classEvidence?: { cohortId: string; classStart: Date; revision: number };
    accessDecision: RefundAccessDecision;
    access: "unchanged" | "pending" | "resolved";
    refund:
        | { kind: "not-started" }
        | { kind: "claimed"; firstAttemptAt: Date }
        | {
              kind: "result";
              firstAttemptAt?: Date;
              result: PurchaseRefundResult;
          };
    decision?: {
        kind: "approved" | "declined";
        policy: string;
        actorUserId: string;
        explanation: string;
        at: Date;
        reviewHash: string;
    };
    escalation?: { actorUserId: string; explanation: string; at: Date };
    decisionHistory?: NonNullable<InternalRefundRequest["decision"]>[];
    submittedAt?: Date;
    claim?: { id: string; expiresAt: Date };
    reviewHash: string;
    revision: number;
    createdAt: Date;
    updatedAt: Date;
}
const schema = new mongoose.Schema<InternalRefundRequest>(
    {
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        requestId: { type: String, required: true, unique: true },
        invoiceId: { type: String, required: true },
        membershipId: { type: String, required: true },
        membershipSessionId: { type: String, required: true },
        userId: { type: String, required: true },
        productName: { type: String, required: true },
        reason: { type: String, required: true },
        state: { type: String, required: true },
        routing: { type: String, required: true },
        assignedTo: { type: String, enum: ["Al", "KK"], required: true },
        quote: { type: mongoose.Schema.Types.Mixed },
        quoteExpiresAt: { type: Date },
        classEvidence: { type: mongoose.Schema.Types.Mixed },
        accessDecision: { type: String, required: true },
        access: {
            type: String,
            enum: ["unchanged", "pending", "resolved"],
            required: true,
        },
        refund: { type: mongoose.Schema.Types.Mixed, required: true },
        decision: { type: mongoose.Schema.Types.Mixed },
        decisionHistory: { type: mongoose.Schema.Types.Mixed, default: [] },
        escalation: { type: mongoose.Schema.Types.Mixed },
        submittedAt: { type: Date },
        claim: { type: mongoose.Schema.Types.Mixed },
        reviewHash: { type: String, required: true },
        revision: { type: Number, required: true, default: 0 },
    },
    { timestamps: true },
);
schema.index({ domain: 1, invoiceId: 1 }, { unique: true });
schema.index({ domain: 1, userId: 1, createdAt: -1 });
schema.index({ domain: 1, assignedTo: 1, state: 1, createdAt: 1 });
export default (mongoose.models.RefundRequest as
    | Model<InternalRefundRequest>
    | undefined) ||
    mongoose.model<InternalRefundRequest>("RefundRequest", schema);
