import { createHash } from "crypto";
import type { IncludedMembershipIdentity } from "../../../common-models/src/stripe-lifecycle";

/** Keep this exact native key/order stable: already-created membership IDs depend on it. */
export function includedMembershipId(
    input: IncludedMembershipIdentity,
): string {
    const key = {
        domain: input.domainId,
        userId: input.userId,
        entityId: input.courseId,
        entityType: "course",
        paymentPlanId: input.paymentPlanId,
        sessionId: input.sessionId,
        isIncludedInPlan: true,
    };
    return `included-${createHash("sha256").update(JSON.stringify(key)).digest("hex")}`;
}
