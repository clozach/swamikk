import { Constants } from "@courselit/common-models";
import { MembershipModel } from "./models";
import type { InternalBillingCancellation } from "@/models/BillingCancellation";
import { prepareRetention, endMembership } from "@/services/member-access";
import type { BillingConsequenceView } from "./types";

export async function freezeBillingRetention(
    record: InternalBillingCancellation,
    cutoff: Date,
): Promise<BillingConsequenceView> {
    let retainedCount = 0,
        unknownReleaseCount = 0;
    for (const target of record.targets) {
        if (!target.accessKey) continue;
        const result = await prepareRetention({
            ...target.accessKey,
            operationId: record.operationId,
            cutoff,
        });
        retainedCount += result.snapshot.retainedLessonIds.length;
        unknownReleaseCount += result.snapshot.unknownReleaseCount;
    }
    return {
        kind: unknownReleaseCount ? "partly-unknown" : "known",
        retainedCount,
        unknownReleaseCount,
        unknownCourseCount: 0,
        archiveAccess: "ends-on-cancellation",
        futureDrops: "stop-on-cancellation",
        cutoff: cutoff.toISOString(),
    };
}
export async function finishBillingRetention(
    record: InternalBillingCancellation,
) {
    // Access records are the immediate authority, even if mirroring native status fails.
    for (const target of record.targets) {
        if (target.accessKey)
            await endMembership({
                ...target.accessKey,
                operationId: record.operationId,
            });
    }
    for (const target of record.targets) {
        await MembershipModel.updateOne(
            {
                domain: record.domain,
                userId: record.userId,
                membershipId: target.membershipId,
                sessionId: target.sessionId,
                entityId: target.entityId,
                entityType: target.entityType,
                status: Constants.MembershipStatus.ACTIVE,
            },
            { $set: { status: Constants.MembershipStatus.EXPIRED } },
        );
    }
}
