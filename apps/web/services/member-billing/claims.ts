import { randomUUID } from "crypto";
import BillingCancellation, {
    type InternalBillingCancellation,
} from "@/models/BillingCancellation";
import { requireCondition } from "@/services/content-changes/errors";

export async function claimCancellation(
    record: InternalBillingCancellation,
    now: Date,
) {
    const id = randomUUID();
    const initial = record.cancellation.kind === "quoted";
    const result = await BillingCancellation.findOneAndUpdate(
        {
            operationId: record.operationId,
            revision: record.revision,
            $or: [
                { claim: { $exists: false } },
                { "claim.expiresAt": { $lte: now } },
            ],
        },
        {
            $set: {
                claim: { id, expiresAt: new Date(now.getTime() + 5 * 60000) },
                ...(initial
                    ? {
                          cancellation: { kind: "preparing", cutoff: now },
                          access: "capped",
                      }
                    : {}),
            },
            $inc: { revision: 1 },
        },
        { new: true },
    ).lean();
    return result ? { id, record: result } : null;
}
export async function saveClaimed(
    operationId: string,
    claimId: string,
    fields: Partial<InternalBillingCancellation>,
    now: Date,
) {
    const result = await BillingCancellation.findOneAndUpdate(
        { operationId, "claim.id": claimId, "claim.expiresAt": { $gt: now } },
        { $set: fields, $inc: { revision: 1 } },
        { new: true },
    ).lean();
    requireCondition(
        result,
        "conflict",
        "Cancellation is being reconciled. Refresh its status.",
        409,
    );
    return result;
}
export async function releaseClaim(operationId: string, claimId: string) {
    await BillingCancellation.updateOne(
        { operationId, "claim.id": claimId },
        { $unset: { claim: "" }, $inc: { revision: 1 } },
    );
}
