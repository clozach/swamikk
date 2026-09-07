import mongoose, { type Model } from "mongoose";
import type { MembershipAccessKey } from "@courselit/common-models";
import type {
    StripeMonthlyCancellationQuote,
    StripeMonthlyRefundResult,
} from "@/payments-new/cancellation";
import type { BillingConsequenceView } from "@/services/member-billing/types";

export interface BillingTarget {
    membershipId: string;
    sessionId: string;
    entityId: string;
    entityType: string;
    accessKey?: MembershipAccessKey;
}
export type BillingCancellationState =
    | { kind: "quoted" }
    | { kind: "preparing"; cutoff: Date }
    | { kind: "uncertain"; cutoff: Date }
    | { kind: "review-required"; cutoff: Date; reason: string }
    | { kind: "canceled"; cutoff: Date; confirmedAt: Date };
export type BillingRefundState =
    | { kind: "not-started" }
    | { kind: "claimed"; firstAttemptAt: Date }
    | {
          kind: "result";
          observationId?: string;
          observedAt?: Date;
          firstAttemptAt?: Date;
          result: StripeMonthlyRefundResult;
      };
export interface InternalBillingCancellation {
    domain: mongoose.Types.ObjectId;
    userId: string;
    operationId: string;
    membershipId: string;
    membershipSessionId: string;
    quote: StripeMonthlyCancellationQuote;
    expiresAt: Date;
    consequences: BillingConsequenceView;
    targets: BillingTarget[];
    cancellation: BillingCancellationState;
    access: "unchanged" | "capped" | "ended";
    refund: BillingRefundState;
    claim?: { id: string; expiresAt: Date };
    revision: number;
    createdAt: Date;
    updatedAt: Date;
}
const schema = new mongoose.Schema<InternalBillingCancellation>(
    {
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        userId: { type: String, required: true },
        operationId: { type: String, required: true, unique: true },
        membershipId: { type: String, required: true },
        membershipSessionId: { type: String, required: true },
        quote: { type: mongoose.Schema.Types.Mixed, required: true },
        expiresAt: { type: Date, required: true },
        consequences: { type: mongoose.Schema.Types.Mixed, required: true },
        targets: { type: mongoose.Schema.Types.Mixed, required: true },
        cancellation: { type: mongoose.Schema.Types.Mixed, required: true },
        access: {
            type: String,
            enum: ["unchanged", "capped", "ended"],
            required: true,
        },
        refund: { type: mongoose.Schema.Types.Mixed, required: true },
        claim: { type: mongoose.Schema.Types.Mixed },
        revision: { type: Number, required: true, default: 0 },
    },
    { timestamps: true },
);
schema.index(
    { domain: 1, membershipId: 1, membershipSessionId: 1 },
    { unique: true },
);
schema.index({ domain: 1, userId: 1, updatedAt: -1 });
export default (mongoose.models.BillingCancellation as
    | Model<InternalBillingCancellation>
    | undefined) ||
    mongoose.model<InternalBillingCancellation>("BillingCancellation", schema);
