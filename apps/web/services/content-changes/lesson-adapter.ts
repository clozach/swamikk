import type {
    ContentChangeInput,
    ContentChangeVersion,
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

export async function prepareVersion(
    input: ContentChangeInput,
    version: number,
    ctx: GQLContext,
): Promise<ContentChangeVersion> {
    const lesson = await editableLesson(input.target.lessonId, ctx);
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
        preparedBy: ctx.user.userId,
        preparedAt: new Date().toISOString(),
    };
}
