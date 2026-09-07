import { requireAccountErasureReady } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import { requireCondition } from "../content-changes/errors";
import { ReviewGrantModel } from "./models";

/** Issuance and every admitted operation hold this issuer's account reservation. */
export async function deleteUserFeedbackReviewGrants(
    domainId: string,
    userId: string,
) {
    await requireAccountErasureReady({ domainId, userId });
    await ReviewGrantModel.deleteMany({
        domain: domainId,
        issuerUserId: userId,
    });
}

/** Offline tenant cleanup only: stop issuance/requests first, then drain admitted work. */
export async function deleteTenantFeedbackReviewGrants(domainId: string) {
    await ReviewGrantModel.updateMany(
        { domain: domainId, "state.kind": "active" },
        {
            $set: {
                state: {
                    kind: "revoking",
                    at: new Date().toISOString(),
                    by: "tenant-cleanup",
                },
            },
        },
    );
    requireCondition(
        !(await ReviewGrantModel.exists({
            domain: domainId,
            "operations.0": { $exists: true },
        })),
        "review_busy",
        "An admitted feedback review is still finishing. No grants were erased.",
        409,
    );
    await ReviewGrantModel.deleteMany({ domain: domainId });
}
