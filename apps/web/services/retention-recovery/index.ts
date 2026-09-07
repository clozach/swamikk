import Binding from "@/models/StripeSubscriptionBinding";
import { MembershipAccessModel as Access } from "../../../../packages/common-logic/src/member-access/models";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import { requireCondition } from "../content-changes/errors";
import { digest, parseEvidence, type RecoveryEvidence } from "./evidence";
import { inspectRecovery, type RecoveryReceipt } from "./inspect";

/** Internal maintenance only. The release operator verifies the archival provenance before approving this receipt. */
export async function prepareRetentionRecovery(
    input: RecoveryEvidence,
): Promise<RecoveryReceipt> {
    return (await inspectRecovery(input)).receipt;
}

export async function applyRetentionRecovery(
    input: RecoveryEvidence & { receipt: RecoveryReceipt },
) {
    await inspectRecovery(input);
    const saved = parseEvidence(input);
    return withAccountWrite(
        {
            domainId: input.domainId,
            userId: saved.userId,
            purpose: "verified-retention-recovery",
        },
        async () => {
            let check = await inspectRecovery(input);
            if (
                check.current.retentionHistory?.some(
                    (item) =>
                        item.recoveryHash === input.receipt.repairHash &&
                        item.evidenceHash === input.preimageSha256,
                ) &&
                digest(check.current.state) === digest(saved.state)
            ) {
                const periods = await Access.find({
                    domain: input.domainId,
                    userId: saved.userId,
                    membershipSessionId: saved.membershipSessionId,
                    membershipId: {
                        $in: [
                            check.binding.membershipId,
                            ...check.binding.includedMembershipIds,
                        ],
                    },
                })
                    .select("state")
                    .lean();
                const unknown = periods.reduce(
                    (sum, period) =>
                        sum +
                        (period.state.kind === "ended"
                            ? period.state.snapshot.unknownReleaseCount
                            : 0),
                    0,
                );
                const settled =
                    check.binding.state.kind === "ended" &&
                    check.binding.state.unknownReleaseCount === unknown &&
                    digest(check.binding.state.nativeCancellation || null) ===
                        digest(check.native);
                return {
                    kind: settled
                        ? ("already-applied" as const)
                        : ("applied-needs-reconciliation" as const),
                    periodId: saved.id,
                };
            }
            requireCondition(
                check.receipt.repairHash === input.receipt.repairHash &&
                    digest(check.receipt) === digest(input.receipt),
                "conflict",
                "The reviewed current state, binding or proof changed. Prepare a new dry run.",
                409,
            );
            const claimId = `retention-recovery:${input.receipt.repairHash}`;
            const claim = await Binding.updateOne(
                {
                    _id: check.binding._id,
                    revision: check.binding.revision,
                    claim: { $exists: false },
                },
                {
                    $set: {
                        claim: {
                            id: claimId,
                            eventId: input.receipt.repairHash,
                            startedAt: new Date(),
                        },
                    },
                },
            );
            requireCondition(
                claim.modifiedCount,
                "conflict",
                "Another subscription reconciliation started.",
                409,
            );
            try {
                check = await inspectRecovery(input, claimId);
                requireCondition(
                    check.receipt.repairHash === input.receipt.repairHash,
                    "conflict",
                    "The reviewed access state changed before restoration.",
                    409,
                );
                const proof = await Binding.updateOne(
                    {
                        _id: check.binding._id,
                        revision: check.binding.revision,
                        "claim.id": claimId,
                    },
                    {
                        $set: { "state.nativeCancellation": check.native },
                        $inc: { revision: 1 },
                    },
                );
                requireCondition(
                    proof.modifiedCount,
                    "conflict",
                    "The verified end changed before restoration.",
                    409,
                );
                // Exact whole-period preimage CAS, including native fields that may be changed by a queued writer.
                const restored = await Access.updateOne(
                    Object.fromEntries(
                        Object.entries(check.current).map(([key, value]) => [
                            key,
                            { $eq: value },
                        ]),
                    ),
                    {
                        $set: { state: saved.state, updatedAt: new Date() },
                        $inc: { revision: 1 },
                        $push: {
                            retentionHistory: {
                                state: check.current.state,
                                preservedAt: new Date(),
                                reason: "verified-preimage-recovery",
                                evidenceHash: input.preimageSha256,
                                recoveryHash: input.receipt.repairHash,
                            },
                        },
                    },
                );
                requireCondition(
                    restored.modifiedCount,
                    "conflict",
                    "The damaged access record changed; restoration was not applied.",
                    409,
                );
                const periods = await Access.find({
                    domain: input.domainId,
                    userId: saved.userId,
                    membershipSessionId: saved.membershipSessionId,
                    membershipId: {
                        $in: [
                            check.binding.membershipId,
                            ...check.binding.includedMembershipIds,
                        ],
                    },
                })
                    .select("state")
                    .lean();
                const unknownReleaseCount = periods.reduce(
                    (sum, period) =>
                        sum +
                        (period.state.kind === "ended"
                            ? period.state.snapshot.unknownReleaseCount
                            : 0),
                    0,
                );
                const settled = await Binding.updateOne(
                    {
                        _id: check.binding._id,
                        revision: check.binding.revision + 1,
                        "claim.id": claimId,
                    },
                    {
                        $set: {
                            "state.unknownReleaseCount": unknownReleaseCount,
                        },
                        $inc: { revision: 1 },
                    },
                );
                return {
                    kind: settled.modifiedCount
                        ? ("applied" as const)
                        : ("applied-needs-reconciliation" as const),
                    periodId: saved.id,
                    revision: check.current.revision + 1,
                    evidenceHash: input.preimageSha256,
                };
            } finally {
                await Binding.updateOne(
                    { _id: check.binding._id, "claim.id": claimId },
                    { $unset: { claim: 1 } },
                );
            }
        },
    );
}
