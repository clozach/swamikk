import { randomUUID } from "crypto";
import { Constants } from "@courselit/common-models";
import type {
    PrepareRetentionInput,
    RetentionResult,
} from "../../../common-models/src/member-access";
import {
    AccessMembershipModel,
    AccessUserModel,
    MembershipAccessModel,
} from "./models";
import { accessDate, accessKey, accessPeriod } from "./keys";
import { accessAssert, MemberAccessError } from "./errors";
import { snapshotRetention } from "./snapshot";
import { withAccountWrite } from "../account-lifecycle/gate";
import type { ProviderEndBoundary } from "../../../common-models/src/stripe-lifecycle";
import {
    frozenSnapshotWithinProviderEnd,
    preservedSnapshot,
} from "./provider-boundary";

type ProviderMembershipEndInput = PrepareRetentionInput &
    Pick<ProviderEndBoundary, "nativeCancellation">;

/** Internal verified-provider hook. It never widens a member's earlier cancellation cap. */
export async function confirmProviderMembershipEnd(
    input: ProviderMembershipEndInput,
): Promise<RetentionResult> {
    return withAccountWrite(
        {
            domainId: input.domainId,
            userId: input.userId,
            purpose: "provider-membership-end",
        },
        () => applyProviderEnd(input),
    );
}
async function applyProviderEnd(
    input: ProviderMembershipEndInput,
): Promise<RetentionResult> {
    const cutoff = accessDate(input.cutoff);
    accessAssert(
        cutoff && cutoff.getTime() <= Date.now() + 1000 && input.operationId,
        "invalid",
        "Verified provider end time is required.",
    );
    const filter = accessKey(input);
    let stored = await MembershipAccessModel.findOne(filter).lean();
    if (!stored) {
        const member = await AccessMembershipModel.findOne({
            domain: input.domainId,
            userId: input.userId,
            membershipId: input.membershipId,
            sessionId: input.membershipSessionId,
            entityId: input.courseId,
            entityType: Constants.MembershipEntityType.COURSE,
        }).lean();
        accessAssert(
            member,
            "not_found",
            "The ended membership session is unavailable.",
        );
        const start =
            member.accessActivation?.sessionId === member.sessionId
                ? accessDate(member.accessActivation.startedAt)
                : undefined;
        const user = await AccessUserModel.findOne({
            domain: input.domainId,
            userId: input.userId,
            active: true,
        }).lean();
        accessAssert(user, "not_found", "The member is unavailable.");
        const purchase = user.purchases?.find(
            (item) => item.courseId === input.courseId,
        );
        await MembershipAccessModel.init();
        try {
            await MembershipAccessModel.updateOne(
                filter,
                {
                    $setOnInsert: {
                        ...filter,
                        id: randomUUID(),
                        start: start
                            ? { kind: "recorded", at: start }
                            : { kind: "legacy-unknown" },
                        state: {
                            kind: "freezing",
                            cutoff,
                            operationId: input.operationId,
                            requestedAt: new Date(),
                        },
                        groupReleases: start
                            ? []
                            : (purchase?.accessibleGroups || []).map(
                                  (groupId) => ({
                                      kind: "legacy-unknown",
                                      groupId,
                                  }),
                              ),
                        deliveries: [],
                        reopenedOperations: [],
                        revision: 0,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    },
                },
                { upsert: true },
            );
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) throw error;
        }
    }
    for (let attempt = 0; attempt < 12; attempt++) {
        stored = await MembershipAccessModel.findOne(filter).lean();
        accessAssert(stored, "unavailable", "The access period was removed.");
        const period = accessPeriod(stored);
        const state = period.state;
        const oldCutoff =
            state.kind === "active"
                ? cutoff
                : state.kind === "freezing"
                  ? new Date(state.cutoff)
                  : new Date(state.snapshot.cutoff);
        const effectiveCutoff = oldCutoff < cutoff ? oldCutoff : cutoff;
        const operationId =
            state.kind === "active" ? input.operationId : state.operationId;
        const boundary = {
            cutoff: effectiveCutoff,
            nativeCancellation: input.nativeCancellation,
        };
        // A provider event may have arrived before native confirmation was saved. Recover
        // its preserved exact operation proof; never recreate IDs from today's content.
        const original =
            input.nativeCancellation && state.kind !== "active"
                ? period.retentionHistory?.find(
                      (item) =>
                          item.state.operationId === state.operationId &&
                          item.state.operationId ===
                              input.nativeCancellation!.operationId &&
                          new Date(item.state.snapshot.cutoff).getTime() ===
                              new Date(
                                  input.nativeCancellation!.cutoff,
                              ).getTime() &&
                          frozenSnapshotWithinProviderEnd(
                              period,
                              item.state,
                              boundary,
                          ),
                  )
                : undefined;
        if (
            original &&
            (state.kind === "freezing" ||
                (state.kind !== "active" &&
                    JSON.stringify(state.snapshot) !==
                        JSON.stringify(original.state.snapshot)))
        ) {
            const restoredState =
                original.state.kind === "ended"
                    ? original.state
                    : {
                          kind: "ended" as const,
                          operationId,
                          snapshot: original.state.snapshot,
                          endedAt: new Date(),
                      };
            const damaged = preservedSnapshot(
                state,
                "verified-preimage-recovery",
            );
            const restored = await MembershipAccessModel.updateOne(
                { ...filter, revision: period.revision },
                {
                    $set: { state: restoredState, updatedAt: new Date() },
                    $inc: { revision: 1 },
                    ...(damaged
                        ? { $push: { retentionHistory: damaged } }
                        : {}),
                },
            );
            if (restored.modifiedCount)
                return {
                    kind: "ended",
                    periodId: period.id,
                    snapshot: restoredState.snapshot,
                };
            continue;
        }
        if (
            (state.kind === "prepared" || state.kind === "ended") &&
            frozenSnapshotWithinProviderEnd(period, state, boundary)
        ) {
            if (state.kind === "ended")
                return {
                    kind: "ended",
                    periodId: period.id,
                    snapshot: state.snapshot,
                };
            const settled = await MembershipAccessModel.updateOne(
                { ...filter, revision: period.revision },
                {
                    $set: {
                        state: {
                            kind: "ended",
                            operationId,
                            snapshot: state.snapshot,
                            endedAt: new Date(),
                        },
                        updatedAt: new Date(),
                    },
                    $inc: { revision: 1 },
                },
            );
            if (settled.modifiedCount)
                return {
                    kind: "ended",
                    periodId: period.id,
                    snapshot: state.snapshot,
                };
            continue;
        }
        const frozen = await MembershipAccessModel.findOneAndUpdate(
            { ...filter, revision: period.revision },
            {
                $set: {
                    state: {
                        kind: "freezing",
                        operationId,
                        cutoff: effectiveCutoff,
                        requestedAt: new Date(),
                    },
                    updatedAt: new Date(),
                },
                $inc: { revision: 1 },
                ...(preservedSnapshot(state)
                    ? { $push: { retentionHistory: preservedSnapshot(state) } }
                    : {}),
            },
            { new: true },
        ).lean();
        if (!frozen) continue;
        const snapshot = await snapshotRetention(
            accessPeriod(frozen),
            effectiveCutoff,
            "historical",
        );
        const finished = await MembershipAccessModel.updateOne(
            { ...filter, revision: frozen.revision, "state.kind": "freezing" },
            {
                $set: {
                    state: {
                        kind: "ended",
                        operationId,
                        snapshot,
                        endedAt: new Date(),
                    },
                    updatedAt: new Date(),
                },
                $inc: { revision: 1 },
            },
        );
        if (finished.modifiedCount)
            return { kind: "ended", periodId: period.id, snapshot };
    }
    throw new MemberAccessError(
        "unavailable",
        "The ended access period changed concurrently; retry reconciliation.",
    );
}
