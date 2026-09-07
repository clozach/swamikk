import { randomUUID } from "crypto";
import { cursorFilter } from "./pagination";
import type {
    ContentChange,
    ContentChangeInput,
    ContentChangeVersion,
    LessonTextPatch,
} from "@courselit/common-models";
import type { InternalContentChange } from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import { ContentChangeModel, FeedbackModel } from "./models";
import { editableLesson, prepareVersion } from "./lesson-adapter";
import { requireCondition } from "./errors";
import { requireFeedbackAdmin } from "./http";
import { contentChangeInputSchema, lessonPatchSchema } from "./validation";
import { lessonRevision } from "./lesson-guard";
import { stableJson } from "./stable";
import { feedbackUi } from "@/config/strings";

export function versionView(
    record: ContentChangeVersion,
): ContentChangeVersion {
    return {
        version: record.version,
        summary: record.summary,
        patch: record.patch,
        baseline: record.baseline,
        preview: record.preview,
        previewHash: record.previewHash,
        preparedBy: record.preparedBy,
        preparedAt: record.preparedAt,
    };
}

export function changeView(record: InternalContentChange): ContentChange {
    return {
        ...versionView(record),
        id: record.id,
        target: record.target,
        feedbackId: record.feedbackId,
        reversesChangeId: record.reversesChangeId,
        state: record.state,
        history: record.history,
        approvals: record.approvals,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
    };
}

export async function getChange(id: string, ctx: GQLContext) {
    const record = await ContentChangeModel.findOne({
        domain: ctx.subdomain._id,
        id,
    });
    requireCondition(record, "not_found", "Content proposal not found.", 404);
    await editableLesson(record.target.lessonId, ctx);
    return record;
}

export async function listChanges(
    ctx: GQLContext,
    before?: string,
): Promise<ContentChange[]> {
    requireFeedbackAdmin(ctx);
    const records = await ContentChangeModel.find({
        domain: ctx.subdomain._id,
        ...cursorFilter(before),
    })
        .sort({ createdAt: -1, id: 1 })
        .limit(50);
    return records.map(changeView);
}

export async function createChange(
    raw: ContentChangeInput,
    ctx: GQLContext,
): Promise<ContentChange> {
    const input = contentChangeInputSchema.parse(raw);
    if (input.feedbackId) {
        requireFeedbackAdmin(ctx);
        const feedback = await FeedbackModel.findOne({
            domain: ctx.subdomain._id,
            id: input.feedbackId,
        });
        requireCondition(feedback, "not_found", "Feedback not found.", 404);
        requireCondition(
            feedback.target.kind !== "lesson" ||
                feedback.target.lessonId === input.target.lessonId,
            "target_mismatch",
            "The proposal must match the selected lesson.",
        );
    }
    const proposed = await prepareVersion(input, 1, ctx);
    const record = await ContentChangeModel.create({
        domain: ctx.subdomain._id,
        id: randomUUID(),
        target: input.target,
        feedbackId: input.feedbackId,
        ...proposed,
        state: { kind: "proposed" },
        history: [],
    });
    return changeView(record);
}

export async function reviseChange(
    id: string,
    version: number,
    patch: LessonTextPatch,
    summary: string,
    ctx: GQLContext,
): Promise<ContentChange> {
    const record = await getChange(id, ctx);
    requireCondition(
        record.version === version &&
            ["proposed", "stale", "failed"].includes(record.state.kind),
        "conflict",
        "This proposal changed. Refresh before revising it.",
        409,
    );
    requireCondition(
        record.history.length < 20,
        "revision_limit",
        "Prepare a new proposal after 20 revisions.",
        409,
    );
    const next = await prepareVersion(
        contentChangeInputSchema.parse({
            target: record.target,
            feedbackId: record.feedbackId,
            patch,
            summary,
        }),
        version + 1,
        ctx,
    );
    const saved = await ContentChangeModel.findOneAndUpdate(
        {
            domain: ctx.subdomain._id,
            id,
            version,
            "state.kind": record.state.kind,
        },
        {
            $set: { ...next, state: { kind: "proposed" } },
            $push: { history: versionView(record) },
        },
        { new: true },
    );
    requireCondition(
        saved,
        "conflict",
        "This proposal changed. Refresh before revising it.",
        409,
    );
    return changeView(saved);
}

export async function rejectChange(
    id: string,
    version: number,
    ctx: GQLContext,
) {
    await getChange(id, ctx);
    const saved = await ContentChangeModel.findOneAndUpdate(
        {
            domain: ctx.subdomain._id,
            id,
            version,
            "state.kind": { $in: ["proposed", "stale", "failed"] },
        },
        {
            $set: {
                state: {
                    kind: "rejected",
                    userId: ctx.user.userId,
                    at: new Date().toISOString(),
                },
            },
        },
        { new: true },
    );
    requireCondition(
        saved,
        "conflict",
        "Only a proposal that has not been applied can be rejected.",
        409,
    );
    return changeView(saved);
}

export async function prepareRevert(
    id: string,
    version: number,
    ctx: GQLContext,
) {
    const original = await getChange(id, ctx);
    requireCondition(
        original.version === version && original.state.kind === "applied",
        "conflict",
        "Only an applied change can prepare a recovery proposal.",
        409,
    );
    const lesson = await editableLesson(original.target.lessonId, ctx);
    requireCondition(
        lessonRevision(lesson) === original.state.appliedRevision &&
            stableJson({ title: lesson.title, content: lesson.content }) ===
                stableJson(original.preview.after),
        "stale",
        "This lesson has changed again. Prepare a new proposal that preserves the later edits.",
        409,
    );
    const patch = lessonPatchSchema.parse(original.preview.before);
    const next = await prepareVersion(
        {
            target: original.target,
            patch,
            summary: feedbackUi.undoSummary.replace(
                "{title}",
                original.preview.before.title,
            ),
        },
        1,
        ctx,
    );
    const record = await ContentChangeModel.create({
        domain: ctx.subdomain._id,
        id: randomUUID(),
        target: original.target,
        reversesChangeId: original.id,
        ...next,
        state: { kind: "proposed" },
        history: [],
    });
    return changeView(record);
}
