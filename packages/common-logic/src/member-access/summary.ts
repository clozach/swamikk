import type {
    MembershipAccessKey,
    MembershipAccessSummary,
} from "../../../common-models/src/member-access";
import { MembershipAccessModel } from "./models";
import { accessAssert } from "./errors";
import { accessDate, accessKey, accessPeriod } from "./keys";
import { snapshotRetention } from "./snapshot";

export async function getMembershipAccessSummary(
    input: MembershipAccessKey,
): Promise<MembershipAccessSummary | null> {
    const record = await MembershipAccessModel.findOne(accessKey(input)).lean();
    if (!record) return null;
    const period = accessPeriod(record);
    const snapshot =
        period.state.kind === "prepared" || period.state.kind === "ended"
            ? period.state.snapshot
            : null;
    return {
        periodId: period.id,
        start: period.start,
        state: period.state.kind,
        cutoff:
            snapshot?.cutoff ||
            (period.state.kind === "freezing" ? period.state.cutoff : null),
        retainedCount: snapshot?.retainedLessonIds.length || 0,
        unknownReleaseCount: snapshot?.unknownReleaseCount || 0,
    };
}

/** Billing preview only. Confirming cancellation must prepare its own fixed snapshot. */
export async function previewRetention(
    input: MembershipAccessKey,
    cutoff = new Date(),
): Promise<
    | {
          kind: "preview";
          snapshot: import("../../../common-models/src/member-access").RetentionSnapshot;
      }
    | { kind: "unknown"; reason: "unrecorded-period" | "access-processing" }
> {
    const date = accessDate(cutoff);
    accessAssert(date, "invalid", "A valid preview time is required.");
    const record = await MembershipAccessModel.findOne(accessKey(input)).lean();
    if (!record) return { kind: "unknown", reason: "unrecorded-period" };
    const period = accessPeriod(record);
    if (period.state.kind === "freezing")
        return { kind: "unknown", reason: "access-processing" };
    if (period.state.kind === "prepared" || period.state.kind === "ended")
        return { kind: "preview", snapshot: period.state.snapshot };
    return { kind: "preview", snapshot: await snapshotRetention(period, date) };
}
