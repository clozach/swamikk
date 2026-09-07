import type {
    LessonContentChangeInput,
    LessonContentChangeVersion,
    LessonTextSnapshot,
} from "@courselit/common-models";
import { Constants } from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import { getLessonOrThrow } from "@/graphql/lessons/logic";
import { lessonValidator } from "@/graphql/lessons/helpers";
import { ContentChangeError, requireCondition } from "./errors";
import { lessonFingerprint, lessonRevision } from "./lesson-guard";
import { fingerprint, stableJson } from "./stable";
import { validateTextEdit } from "./text-safety";

export async function editableLesson(lessonId: string, ctx: GQLContext) {
    requireCondition(
        ctx.user && String(ctx.user.domain) === String(ctx.subdomain._id),
        "forbidden",
        "Sign in with an account that can edit this lesson.",
        403,
    );
    try {
        return await getLessonOrThrow(lessonId, ctx);
    } catch {
        throw new ContentChangeError(
            "not_found",
            "Lesson not found or editing is not permitted.",
            404,
        );
    }
}

export async function prepareLessonSnapshotVersion(
    input: LessonContentChangeInput,
    version: number,
    lesson: Awaited<ReturnType<typeof editableLesson>>,
    preparedBy: string,
): Promise<LessonContentChangeVersion> {
    requireCondition(
        lesson.type === Constants.LessonType.TEXT &&
            lesson.content &&
            "type" in lesson.content &&
            lesson.content.type === "doc",
        "unsupported_target",
        "This direct editor currently supports text lessons.",
    );
    const before: LessonTextSnapshot = {
        title: lesson.title,
        content: JSON.parse(JSON.stringify(lesson.content)),
    };
    const after: LessonTextSnapshot = { ...before, ...input.patch };
    if (input.patch.content) validateTextEdit(before.content, after.content);
    lessonValidator({
        type: lesson.type,
        content: JSON.stringify(after.content),
        requiresEnrollment: lesson.requiresEnrollment,
    });
    requireCondition(
        stableJson(before) !== stableJson(after),
        "no_change",
        "The proposal does not change this lesson.",
    );
    const baseline = {
        revision: lessonRevision(lesson),
        fingerprint: lessonFingerprint(lesson),
        snapshot: before,
        courseId: lesson.courseId,
        published: lesson.published,
    };
    const preview = { before, after };
    const previewHash = fingerprint({
        target: input.target,
        feedbackId: input.feedbackId,
        version,
        summary: input.summary,
        patch: input.patch,
        baseline,
        preview,
    });
    return {
        version,
        summary: input.summary,
        patch: input.patch,
        baseline,
        preview,
        previewHash,
        preparedBy,
        preparedAt: new Date().toISOString(),
    };
}

/** Existing administrator entry point retains native lesson authorization. */
export async function prepareVersion(
    input: LessonContentChangeInput,
    version: number,
    ctx: GQLContext,
): Promise<LessonContentChangeVersion> {
    return prepareLessonSnapshotVersion(
        input,
        version,
        await editableLesson(input.target.lessonId, ctx),
        ctx.user.userId,
    );
}
