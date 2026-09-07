import { Constants } from "@courselit/common-models";
import type {
    MembershipAccessPeriod,
    MembershipAccessOperation,
    PrepareRetentionInput,
    RetentionResult,
} from "../../../common-models/src/member-access";
import { AccessMembershipModel, MembershipAccessModel } from "./models";
import { accessAssert, MemberAccessError } from "./errors";
import { accessDate, accessKey, accessPeriod } from "./keys";
import { snapshotRetention } from "./snapshot";
import { ensureOperationPeriod } from "./activation";
export { ensureMembershipAccess } from "./activation";
export { getMembershipAccessSummary, previewRetention } from "./summary";

function preparedResult(period: MembershipAccessPeriod): RetentionResult {
    accessAssert(
        period.state.kind === "prepared" || period.state.kind === "ended",
        "conflict",
        "Retention is still being prepared.",
    );
    return {
        kind: period.state.kind,
        periodId: period.id,
        snapshot: period.state.snapshot,
    };
}

export async function prepareRetention(
    input: PrepareRetentionInput,
): Promise<RetentionResult> {
    const cutoff = accessDate(input.cutoff);
    accessAssert(
        cutoff && cutoff.getTime() <= Date.now() + 1000,
        "invalid",
        "A fixed request cutoff is required.",
    );
    accessAssert(
        input.operationId && input.operationId.length <= 256,
        "invalid",
        "An operation identifier is required.",
    );
    for (let attempt = 0; attempt < 12; attempt++) {
        const period = await ensureOperationPeriod(input);
        if (period.state.kind !== "active") {
            accessAssert(
                period.state.operationId === input.operationId,
                "conflict",
                "Another cancellation operation already owns this period.",
            );
            const storedCutoff =
                period.state.kind === "freezing"
                    ? period.state.cutoff
                    : period.state.snapshot.cutoff;
            accessAssert(
                new Date(storedCutoff).getTime() === cutoff.getTime(),
                "conflict",
                "Retry with the original cancellation cutoff.",
            );
            if (period.state.kind !== "freezing") return preparedResult(period);
        } else {
            accessAssert(
                !period.reopenedOperations.some(
                    (item) => item.operationId === input.operationId,
                ),
                "conflict",
                "This cancellation was already aborted; start a new operation.",
            );
            const frozen = await MembershipAccessModel.findOneAndUpdate(
                {
                    ...accessKey(input),
                    revision: period.revision,
                    "state.kind": "active",
                },
                {
                    $set: {
                        state: {
                            kind: "freezing",
                            operationId: input.operationId,
                            cutoff,
                            requestedAt: new Date(),
                        },
                        updatedAt: new Date(),
                    },
                    $inc: { revision: 1 },
                },
                { new: true },
            ).lean();
            if (!frozen) continue;
        }
        const frozen = await MembershipAccessModel.findOne(
            accessKey(input),
        ).lean();
        accessAssert(
            frozen &&
                frozen.state.kind === "freezing" &&
                frozen.state.operationId === input.operationId,
            "conflict",
            "The cancellation state changed.",
        );
        const snapshot = await snapshotRetention(accessPeriod(frozen), cutoff);
        const result = await MembershipAccessModel.findOneAndUpdate(
            {
                ...accessKey(input),
                revision: frozen.revision,
                "state.kind": "freezing",
                "state.operationId": input.operationId,
            },
            {
                $set: {
                    state: {
                        kind: "prepared",
                        operationId: input.operationId,
                        snapshot,
                        preparedAt: new Date(),
                    },
                    updatedAt: new Date(),
                },
                $inc: { revision: 1 },
            },
            { new: true },
        ).lean();
        if (result) return preparedResult(accessPeriod(result));
    }
    throw new MemberAccessError(
        "unavailable",
        "Access changed concurrently; reconcile this cancellation before retrying.",
    );
}

export async function endMembership(
    input: MembershipAccessOperation,
): Promise<RetentionResult> {
    const period = await ensureOperationPeriod(input);
    accessAssert(
        period.state.kind === "prepared" || period.state.kind === "ended",
        "conflict",
        "Prepare retention before ending membership access.",
    );
    accessAssert(
        period.state.operationId === input.operationId,
        "conflict",
        "The operation does not own this period.",
    );
    if (period.state.kind === "ended") return preparedResult(period);
    await MembershipAccessModel.updateOne(
        {
            ...accessKey(input),
            "state.kind": "prepared",
            "state.operationId": input.operationId,
        },
        {
            $set: {
                state: {
                    kind: "ended",
                    operationId: input.operationId,
                    snapshot: period.state.snapshot,
                    endedAt: new Date(),
                },
                updatedAt: new Date(),
            },
            $inc: { revision: 1 },
        },
    );
    const result = await MembershipAccessModel.findOne(accessKey(input)).lean();
    accessAssert(
        result,
        "unavailable",
        "The ended access record is unavailable.",
    );
    return preparedResult(accessPeriod(result));
}

export async function abortRetention(
    input: MembershipAccessOperation & {
        providerStillActive: true;
        evidenceId: string;
    },
): Promise<MembershipAccessPeriod> {
    accessAssert(
        input.providerStillActive === true &&
            input.evidenceId &&
            input.evidenceId.length <= 256,
        "invalid",
        "Confirmed active-provider evidence is required to reopen access.",
    );
    const period = await ensureOperationPeriod(input);
    if (
        period.state.kind === "active" &&
        period.reopenedOperations.some(
            (item) =>
                item.operationId === input.operationId &&
                item.evidenceId === input.evidenceId,
        )
    )
        return period;
    accessAssert(
        period.state.kind === "prepared" || period.state.kind === "freezing",
        "conflict",
        "Only an unfinalized cancellation can be reopened.",
    );
    accessAssert(
        period.state.operationId === input.operationId,
        "conflict",
        "The operation does not own this period.",
    );
    const membership = await AccessMembershipModel.exists({
        domain: input.domainId,
        membershipId: input.membershipId,
        sessionId: input.membershipSessionId,
        userId: input.userId,
        entityId: input.courseId,
        status: Constants.MembershipStatus.ACTIVE,
    });
    accessAssert(
        membership,
        "conflict",
        "The matching membership must still be active.",
    );
    const reopened = await MembershipAccessModel.findOneAndUpdate(
        {
            ...accessKey(input),
            revision: period.revision,
            "state.operationId": input.operationId,
            "state.kind": { $in: ["prepared", "freezing"] },
        },
        {
            $set: { state: { kind: "active" }, updatedAt: new Date() },
            $push: {
                reopenedOperations: {
                    operationId: input.operationId,
                    evidenceId: input.evidenceId,
                    at: new Date(),
                },
            },
            $inc: { revision: 1 },
        },
        { new: true },
    ).lean();
    accessAssert(
        reopened,
        "conflict",
        "Access changed; reconcile before reopening.",
    );
    return accessPeriod(reopened);
}
