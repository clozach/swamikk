import type GQLContext from "@/models/GQLContext";
import { ContentChangeModel, FeedbackModel } from "./models";
import { requireFeedbackAdmin } from "./http";
import { requireCondition } from "./errors";

export async function deleteChange(id: string, ctx: GQLContext) {
    requireFeedbackAdmin(ctx);
    // Applied snapshots are recovery/audit records; unresolved writes hold target locks.
    // Only never-applied settled proposals can be removed through this endpoint.
    const result = await ContentChangeModel.deleteOne({
        domain: ctx.subdomain._id,
        id,
        "state.kind": { $in: ["proposed", "rejected", "stale", "failed"] },
    });
    requireCondition(
        result.deletedCount === 1,
        "conflict",
        "Applied or unresolved changes are retained for recovery. Only an unapplied proposal can be removed.",
        409,
    );
    return { deleted: true };
}

/** Tenant teardown calls this only after that tenant's writes and in-flight requests stop. */
export async function deleteTenantContentChangeData(domain: string) {
    requireCondition(
        !(await ContentChangeModel.exists({
            domain,
            activeTarget: { $exists: true },
        })),
        "conflict",
        "Reconcile active content changes before removing site data.",
        409,
    );
    await Promise.all([
        FeedbackModel.deleteMany({ domain }),
        ContentChangeModel.deleteMany({ domain }),
    ]);
}

export { deleteUserFeedback } from "./personal-data";
