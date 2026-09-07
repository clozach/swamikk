import { randomUUID } from "crypto";
import LessonModel, { type Lesson } from "@/models/Lesson";
import type GQLContext from "@/models/GQLContext";
import type {
    LessonPublicationObservation,
    PublicationObservationCandidate,
    PublicationObservationResult,
} from "../../../../packages/common-models/src/publication-observation";
import { editableCourse, type ScheduleCourse } from "../drip-admin/guard";
import { scheduleGroupId } from "../../../../packages/common-logic/src/drip-schedule";
import { lessonWriteFilter } from "../content-changes/lesson-guard";
import { publicationObservationInput } from "./validation";

type ObservedLesson = Lesson & {
    publicationObservation?: LessonPublicationObservation;
};
type ObservedCourse = ScheduleCourse & { releaseRevision?: number };
const revision = (course: ObservedCourse) => course.releaseRevision || 0;
const validDate = (value: unknown): Date | null => {
    if (!value) return null;
    const date = new Date(value as string);
    return Number.isFinite(date.getTime()) ? date : null;
};

export function currentAvailabilityWitness(
    lesson: ObservedLesson,
    course: ObservedCourse,
): boolean {
    const group = course.groups.find(
        (item) => scheduleGroupId(item) === lesson.groupId,
    );
    const witness = lesson.publicationObservation?.witness;
    return !!(
        course.published &&
        lesson.published &&
        group &&
        witness &&
        witness.groupId === lesson.groupId &&
        witness.releaseRevision === revision(course) &&
        witness.availability ===
            (!group.drip?.status ? "available" : "scheduled") &&
        validDate(witness.observedAt) &&
        validDate(lesson.publicationObservation?.publishedBy)
    );
}

export async function readPublicationCandidates(
    courseId: string,
    ctx: GQLContext,
    cursor?: string,
) {
    const course = (await editableCourse(courseId, ctx)) as ObservedCourse;
    const lessons = (await LessonModel.find({
        domain: ctx.subdomain._id,
        courseId,
        published: true,
        ...(cursor ? { lessonId: { $gt: cursor } } : {}),
    })
        .sort({ lessonId: 1 })
        .limit(101)
        .lean()) as unknown as ObservedLesson[];
    const candidates: PublicationObservationCandidate[] = lessons
        .slice(0, 100)
        .map((lesson) => ({
            lessonId: lesson.lessonId,
            title: lesson.title,
            groupId: lesson.groupId,
            hasFirstPublicationDate: lesson.publication?.kind === "known",
            publishedBy:
                validDate(
                    lesson.publicationObservation?.publishedBy,
                )?.toISOString() || null,
            availabilityWitnessCurrent: currentAvailabilityWitness(
                lesson,
                course,
            ),
        }));
    return {
        courseId,
        published: course.published,
        releaseRevision: revision(course),
        candidates,
        hasMore: lessons.length > 100,
        nextCursor:
            lessons.length > 100
                ? candidates[candidates.length - 1].lessonId
                : null,
    };
}

async function observedResult(
    lesson: ObservedLesson,
    courseId: string,
    observationId: string,
    ctx: GQLContext,
    already = false,
): Promise<PublicationObservationResult> {
    const observation = lesson.publicationObservation;
    const publishedBy = validDate(observation?.publishedBy);
    const witnessAt = validDate(observation?.witness.observedAt);
    if (
        !observation ||
        !publishedBy ||
        !witnessAt ||
        (!already && observation.witness.observationId !== observationId)
    )
        return { lessonId: lesson.lessonId, kind: "uncertain" };
    const current = (await editableCourse(courseId, ctx)) as ObservedCourse;
    return {
        lessonId: lesson.lessonId,
        kind: !currentAvailabilityWitness(lesson, current)
            ? "publication-only"
            : already
              ? "already-recorded"
              : "recorded",
        publishedBy: publishedBy.toISOString(),
        witnessAt: witnessAt.toISOString(),
    };
}

async function observeLessonPublication(
    courseId: string,
    lessonId: string,
    ctx: GQLContext,
): Promise<PublicationObservationResult> {
    // Read the lesson first, the course second, then guard the lesson's unchanged
    // publication/group/version. A successful CAS proves it was published at the
    // intervening course read. The DB timestamp is an upper bound on that fact.
    const lesson = (await LessonModel.findOne({
        domain: ctx.subdomain._id,
        courseId,
        lessonId,
    }).lean()) as ObservedLesson | null;
    if (!lesson?.published)
        return { lessonId, kind: "skipped", reason: "lesson-unavailable" };
    if (lesson.publication?.kind === "known")
        return {
            lessonId,
            kind: "skipped",
            reason: "first-publication-recorded",
        };
    const course = (await editableCourse(courseId, ctx)) as ObservedCourse;
    if (!course.published)
        return { lessonId, kind: "skipped", reason: "course-unavailable" };
    const group = course.groups.find(
        (item) => scheduleGroupId(item) === lesson.groupId,
    );
    if (!group)
        return { lessonId, kind: "skipped", reason: "group-unavailable" };
    if (currentAvailabilityWitness(lesson, course))
        return observedResult(
            lesson,
            courseId,
            lesson.publicationObservation!.witness.observationId,
            ctx,
            true,
        );
    const observationId = randomUUID();
    const previousUpperBound = validDate(
        lesson.publicationObservation?.publishedBy,
    );
    const filter = lessonWriteFilter(lesson);
    try {
        const recorded = await LessonModel.updateOne(filter, {
            $set: {
                "publicationObservation.witness.groupId": lesson.groupId,
                "publicationObservation.witness.releaseRevision":
                    revision(course),
                "publicationObservation.witness.availability": !group.drip
                    ?.status
                    ? "available"
                    : "scheduled",
                "publicationObservation.witness.observationId": observationId,
                "publicationObservation.witness.actorUserId": ctx.user.userId,
            },
            $currentDate: {
                "publicationObservation.witness.observedAt": true,
                ...(!previousUpperBound
                    ? { "publicationObservation.publishedBy": true }
                    : {}),
            },
            $inc: { __v: 1 },
        });
        if (!recorded.modifiedCount)
            return { lessonId, kind: "skipped", reason: "lesson-changed" };
    } catch {
        // Read the operation receipt once; never assume a thrown response means
        // the observation did not persist, and never blindly overwrite it.
    }
    const current = (await LessonModel.findOne({
        domain: ctx.subdomain._id,
        courseId,
        lessonId,
    }).lean()) as ObservedLesson | null;
    if (!current) return { lessonId, kind: "uncertain" };
    return observedResult(current, courseId, observationId, ctx);
}

export async function observePublications(raw: unknown, ctx: GQLContext) {
    const input = publicationObservationInput.parse(raw);
    await editableCourse(input.courseId, ctx);
    const results: PublicationObservationResult[] = [];
    for (const lessonId of input.lessonIds)
        results.push(
            await observeLessonPublication(input.courseId, lessonId, ctx),
        );
    return { courseId: input.courseId, results };
}
