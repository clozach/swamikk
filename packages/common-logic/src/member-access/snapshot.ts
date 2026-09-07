import type {
    MembershipAccessPeriod,
    RetentionSnapshot,
} from "../../../common-models/src/member-access";
import { AccessCourseModel, AccessLessonModel } from "./models";
import { accessDate } from "./keys";
import { classifyObservedRelease } from "./observations";

/** Unknown historical dates never become a fresh drop just because this service observed them. */
export async function snapshotRetention(
    period: MembershipAccessPeriod,
    cutoff: Date,
): Promise<RetentionSnapshot> {
    const course = await AccessCourseModel.findOne({
        domain: period.domainId,
        courseId: period.courseId,
        published: true,
    }).lean();
    const snapshot: RetentionSnapshot = {
        cutoff,
        visibleLessonIds: [],
        retainedLessonIds: [],
        unknownReleaseCount: 0,
    };
    if (!course) return snapshot;
    const lessons = await AccessLessonModel.find({
        domain: period.domainId,
        courseId: period.courseId,
        published: true,
    }).lean();
    const start =
        period.start.kind === "recorded"
            ? accessDate(period.start.at)
            : undefined;
    for (const lesson of lessons) {
        const group = course.groups?.find(
            (item: any) => String(item._id || item.id) === lesson.groupId,
        );
        if (!group) continue;
        const publication =
            lesson.publication?.kind === "known"
                ? accessDate(lesson.publication.firstPublishedAt)
                : undefined;
        if (publication && publication >= cutoff) continue;
        const release = period.groupReleases.find(
            (item) => item.groupId === lesson.groupId,
        );
        const releasedAt =
            release?.kind === "drip" ? accessDate(release.at) : undefined;
        if (
            group.drip?.status &&
            (!release || (releasedAt && releasedAt >= cutoff))
        )
            continue;
        snapshot.visibleLessonIds.push(lesson.lessonId);
        if (!publication) {
            const evidence = classifyObservedRelease({
                observation: lesson.publicationObservation,
                groupId: lesson.groupId,
                releaseRevision: course.releaseRevision || 0,
                availableNow: !group.drip?.status,
                start,
                cutoff,
                releasedAt,
            });
            if (evidence === "retained")
                snapshot.retainedLessonIds.push(lesson.lessonId);
            if (evidence === "unknown") snapshot.unknownReleaseCount++;
            continue;
        }
        if (!start || !publication || (group.drip?.status && !releasedAt)) {
            snapshot.unknownReleaseCount++;
            continue;
        }
        const effectiveRelease =
            releasedAt && releasedAt < cutoff && releasedAt > publication
                ? releasedAt
                : publication;
        if (effectiveRelease >= start && effectiveRelease < cutoff)
            snapshot.retainedLessonIds.push(lesson.lessonId);
    }
    snapshot.visibleLessonIds.sort();
    snapshot.retainedLessonIds.sort();
    return snapshot;
}
