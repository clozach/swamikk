import RefundRequest from "@/models/RefundRequest";
import { requireAccountErasureReady } from "../../../../packages/common-logic/src/account-lifecycle/gate";

/** Submitted or attempted requests retain the evidence needed to reconcile money. */
export async function deleteUserRefundDrafts(domain: string, userId: string) {
    await requireAccountErasureReady({ domainId: domain, userId });
    await RefundRequest.deleteMany({
        domain,
        userId,
        state: "draft",
        submittedAt: { $exists: false },
        "refund.kind": "not-started",
        decision: { $exists: false },
        escalation: { $exists: false },
        claim: { $exists: false },
        $or: [
            { decisionHistory: { $exists: false } },
            { decisionHistory: { $size: 0 } },
        ],
    });
}
