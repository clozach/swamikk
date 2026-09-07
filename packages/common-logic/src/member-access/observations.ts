import type { LessonPublicationObservation } from "../../../common-models/src/publication-observation";
import { accessDate } from "./keys";

export function classifyObservedRelease({
    observation,
    groupId,
    releaseRevision,
    availableNow,
    start,
    cutoff,
    releasedAt,
}: {
    observation?: LessonPublicationObservation;
    groupId: string;
    releaseRevision: number;
    availableNow: boolean;
    start?: Date;
    cutoff: Date;
    releasedAt?: Date;
}): "archive" | "retained" | "unknown" {
    const publishedBy = accessDate(observation?.publishedBy);
    if (!publishedBy || !start) return "unknown";
    // An actual member-specific release after observed publication establishes
    // the effective release exactly, independently of later schedule changes.
    if (releasedAt && releasedAt < cutoff) {
        if (publishedBy <= releasedAt && releasedAt >= start) return "retained";
        if (publishedBy < start && releasedAt < start) return "archive";
        return "unknown";
    }
    const witness = observation?.witness;
    const witnessedAt = accessDate(witness?.observedAt);
    if (
        availableNow &&
        witness?.availability === "available" &&
        witness.groupId === groupId &&
        witness.releaseRevision === releaseRevision &&
        witnessedAt &&
        publishedBy <= witnessedAt &&
        witnessedAt < start &&
        witnessedAt < cutoff
    ) {
        return "archive";
    }
    // A later observation or an obsolete availability witness cannot establish
    // what an earlier member received. Unknown is evidence quality, not a revoke.
    return "unknown";
}
