import User from "@/models/User";
import Binding from "@/models/StripeSubscriptionBinding";
import Membership from "@/models/Membership";
import { MembershipAccessModel as Access } from "../../../../packages/common-logic/src/member-access/models";
import { nativeCancellationProof } from "@/payments-new/stripe-lifecycle/native-end-proof";
import { frozenSnapshotWithinProviderEnd } from "../../../../packages/common-logic/src/member-access/provider-boundary";
import { requireCondition } from "../content-changes/errors";
import { digest, parseEvidence, type RecoveryEvidence } from "./evidence";

export async function inspectRecovery(
    input: RecoveryEvidence,
    ownClaim?: string,
) {
    const saved = parseEvidence(input);
    const admin = await User.findOne({
        domain: input.domainId,
        userId: input.adminUserId,
        active: true,
        permissions: "setting:manage",
    })
        .select("userId")
        .lean();
    requireCondition(
        admin,
        "forbidden",
        "An active site settings administrator is required.",
        403,
    );
    const user = await User.findOne({
        domain: input.domainId,
        userId: saved.userId,
        active: true,
    })
        .select("userId")
        .lean();
    requireCondition(
        user,
        "conflict",
        "The member account is no longer active.",
        409,
    );
    const member = await Membership.findOne({
        domain: input.domainId,
        userId: saved.userId,
        membershipId: saved.membershipId,
        sessionId: saved.membershipSessionId,
        entityId: saved.courseId,
        entityType: "course",
        status: "expired",
    }).lean();
    requireCondition(
        member,
        "conflict",
        "The ended native session changed; do not restore this preimage.",
        409,
    );
    const current = await Access.findOne({
        _id: saved._id,
        domain: input.domainId,
        id: saved.id,
        userId: saved.userId,
        courseId: saved.courseId,
        membershipId: saved.membershipId,
        membershipSessionId: saved.membershipSessionId,
    }).lean();
    requireCondition(
        current?.state.kind === "ended" &&
            current.state.operationId === saved.state.operationId &&
            current.revision >= saved.revision &&
            digest(current.start) === digest(saved.start) &&
            new Date(current.createdAt).getTime() === saved.createdAt.getTime(),
        "conflict",
        "The current access period does not match the captured native operation.",
        409,
    );
    const binding = await Binding.findOne({
        domain: input.domainId,
        userId: saved.userId,
        membershipSessionId: saved.membershipSessionId,
        "state.kind": "ended",
        $or: [
            { membershipId: saved.membershipId },
            { includedMembershipIds: saved.membershipId },
        ],
    }).lean();
    requireCondition(
        binding?.state.kind === "ended" &&
            (!binding.claim || binding.claim.id === ownClaim),
        "conflict",
        "The provider end is unavailable or another reconciliation is still claimed.",
        409,
    );
    const native = await nativeCancellationProof(
        binding,
        new Date(binding.state.cutoff),
    );
    requireCondition(
        native &&
            native.operationId === saved.state.operationId &&
            new Date(native.cutoff).getTime() ===
                saved.state.snapshot.cutoff.getTime() &&
            frozenSnapshotWithinProviderEnd(saved, saved.state, {
                cutoff: binding.state.cutoff,
                nativeCancellation: native,
            }),
        "conflict",
        "The saved cutoff lacks matching confirmed native cancellation evidence.",
        409,
    );
    const bindingHash = digest({
        _id: binding._id,
        domain: binding.domain,
        userId: binding.userId,
        membershipId: binding.membershipId,
        membershipSessionId: binding.membershipSessionId,
        subscriptionId: binding.subscriptionId,
        customerId: binding.customerId,
        mode: binding.mode,
        revision: binding.revision,
        state: binding.state,
    });
    const receipt = {
        kind: "ready" as const,
        periodId: current.id,
        preimageSha256: input.preimageSha256,
        currentRevision: current.revision,
        currentHash: digest(current),
        bindingHash,
        proofHash: digest(native),
        restoredState: saved.state,
    };
    return {
        saved,
        current,
        binding,
        native,
        receipt: { ...receipt, repairHash: digest(receipt) },
    };
}
export type RecoveryReceipt = Awaited<
    ReturnType<typeof inspectRecovery>
>["receipt"];
