import type {
    MembershipAccessPeriod,
    MembershipAccessState,
} from "../../../common-models/src/member-access";
import type { ProviderEndBoundary } from "../../../common-models/src/stripe-lifecycle";

type FrozenState = Extract<
    MembershipAccessState,
    { kind: "prepared" | "ended" }
>;

/** A coarse provider timestamp cannot contradict the same proven local cancellation within that second. */
export function frozenSnapshotWithinProviderEnd(
    target: Pick<MembershipAccessPeriod, "membershipId" | "courseId">,
    state: FrozenState,
    boundary: ProviderEndBoundary,
): boolean {
    const saved = new Date(state.snapshot.cutoff).getTime();
    const provider = new Date(boundary.cutoff).getTime();
    if (saved <= provider) return true;
    const proof = boundary.nativeCancellation;
    return (
        !!proof &&
        provider % 1000 === 0 &&
        Math.floor(saved / 1000) * 1000 === provider &&
        proof.operationId === state.operationId &&
        new Date(proof.cutoff).getTime() === saved &&
        proof.targets.some(
            (item) =>
                item.membershipId === target.membershipId &&
                item.courseId === target.courseId,
        )
    );
}

export function providerCapAlreadyApplied(
    period: MembershipAccessPeriod,
    boundary: ProviderEndBoundary,
) {
    const state = period.state;
    if (state.kind === "active") return false;
    if (state.kind === "freezing")
        return new Date(state.cutoff) <= new Date(boundary.cutoff);
    return frozenSnapshotWithinProviderEnd(period, state, boundary);
}

export function preservedSnapshot(
    state: MembershipAccessState,
    reason:
        | "provider-earlier-end"
        | "verified-preimage-recovery" = "provider-earlier-end",
    evidenceHash?: string,
) {
    return state.kind === "prepared" || state.kind === "ended"
        ? {
              state,
              preservedAt: new Date(),
              reason,
              ...(evidenceHash ? { evidenceHash } : {}),
          }
        : undefined;
}
