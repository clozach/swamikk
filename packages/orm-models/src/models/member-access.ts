import type { MembershipAccessPeriod } from "../../../common-models/src/member-access";
import mongoose from "mongoose";

export interface InternalMembershipAccess
    extends Omit<MembershipAccessPeriod, "domainId"> {
    domain: mongoose.Types.ObjectId;
}

export const MembershipAccessSchema =
    new mongoose.Schema<InternalMembershipAccess>({
        domain: { type: mongoose.Schema.Types.ObjectId, required: true },
        id: { type: String, required: true, unique: true },
        userId: { type: String, required: true },
        courseId: { type: String, required: true },
        membershipId: { type: String, required: true },
        membershipSessionId: { type: String, required: true },
        start: { type: mongoose.Schema.Types.Mixed, required: true },
        state: { type: mongoose.Schema.Types.Mixed, required: true },
        groupReleases: { type: mongoose.Schema.Types.Mixed, default: [] },
        lastRelativeReleaseAt: Date,
        deliveries: { type: mongoose.Schema.Types.Mixed, default: [] },
        revision: { type: Number, default: 0 },
        createdAt: { type: Date, required: true },
        updatedAt: { type: Date, required: true },
        reopenedOperations: { type: mongoose.Schema.Types.Mixed, default: [] },
        retentionHistory: { type: mongoose.Schema.Types.Mixed, default: [] },
    });
MembershipAccessSchema.index(
    { domain: 1, membershipId: 1, membershipSessionId: 1 },
    { unique: true },
);
MembershipAccessSchema.index({ domain: 1, userId: 1, courseId: 1 });
