import { isPageCreationRecord } from "./page-creation-types";
import {
    approvePageCreation,
    reconcilePageCreation,
} from "./page-creation-application";
import { randomUUID } from "crypto";
import type {
    ContentChange,
    ContentChangeApproval,
} from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import {
    updateLesson,
    type LessonWithStringContent,
} from "@/graphql/lessons/logic";
import { ContentChangeModel } from "./models";
import { changeView, getChange } from "./proposals";
import { editableLesson } from "./lesson-adapter";
import { ContentChangeError, requireCondition } from "./errors";
import { lessonFingerprint, lessonRevision } from "./lesson-guard";
import { lessonWriteFilter } from "./lesson-guard";
import LessonModel from "@/models/Lesson";

import { settle } from "./settle";
import { isPageRecord } from "./adapters";
import { approvePageChange, reconcilePageChange } from "./page-application";

export async function reconcileChange(
    id: string,
    ctx: GQLContext,
): Promise<ContentChange> {
    const record = await getChange(id, ctx);
    if (isPageCreationRecord(record)) return reconcilePageCreation(record, ctx);
    if (isPageRecord(record)) return reconcilePageChange(record, ctx);
    const state = record.state;
    if (state.kind !== "applying" && state.kind !== "uncertain")
        return changeView(record);
    const lesson = await editableLesson(record.target.lessonId, ctx);
    const receipt = lesson.contentChangeReceipt;
    if (
        receipt?.operationId === state.operationId &&
        receipt.outcome === "applied"
    ) {
        return settle(record, {
            kind: "applied",
            operationId: state.operationId,
            approval: state.approval,
            appliedAt: receipt.appliedAt,
            appliedRevision: receipt.revision,
        });
    }
    if (
        receipt?.operationId === state.operationId &&
        receipt.outcome === "cancelled"
    ) {
        return settle(record, {
            kind: "failed",
            reason: "The interrupted operation was cancelled before it could change the lesson. Prepare a new version to retry.",
        });
    }
    if (lessonRevision(lesson) > record.baseline.revision) {
        return settle(record, {
            kind: "failed",
            reason: "The lesson changed and this operation has no applied receipt. Its old write can no longer commit. Prepare a new version.",
        });
    }
    // Fence an interrupted write atomically. Either its approved content+receipt wins,
    // or this revision-only cancellation wins and prevents any delayed old CAS committing.
    const fenced = await LessonModel.findOneAndUpdate(
        lessonWriteFilter(lesson),
        {
            $inc: { __v: 1 },
            $set: {
                contentChangeReceipt: {
                    outcome: "cancelled",
                    operationId: state.operationId,
                    revision: lessonRevision(lesson) + 1,
                    appliedAt: new Date().toISOString(),
                },
            },
        },
        { new: true },
    );
    if (fenced)
        return settle(record, {
            kind: "failed",
            reason: "The interrupted operation was cancelled before it changed the lesson. Prepare a new version to retry.",
        });
    const currentLesson = await editableLesson(record.target.lessonId, ctx);
    const currentReceipt = currentLesson.contentChangeReceipt;
    if (
        currentReceipt?.operationId === state.operationId &&
        currentReceipt.outcome === "applied"
    ) {
        return settle(record, {
            kind: "applied",
            operationId: state.operationId,
            approval: state.approval,
            appliedAt: currentReceipt.appliedAt,
            appliedRevision: currentReceipt.revision,
        });
    }
    // Another write won during reconciliation. Preserve the lock for a fresh read.
    return settle(
        record,
        {
            ...state,
            kind: "uncertain",
            reason: "No committed operation receipt is available. Keep this proposal and ask an operator to reconcile it; do not repeat the edit.",
        },
        true,
    );
}

export async function approveChange(
    id: string,
    version: number,
    previewHash: string,
    ctx: GQLContext,
): Promise<ContentChange> {
    const record = await getChange(id, ctx);
    if (isPageCreationRecord(record))
        return approvePageCreation(record, version, previewHash, ctx);
    if (isPageRecord(record))
        return approvePageChange(record, version, previewHash, ctx);
    requireCondition(
        record.version === version && record.previewHash === previewHash,
        "conflict",
        "The preview changed. Review the current version before approving.",
        409,
    );
    if (["applied", "applying", "uncertain"].includes(record.state.kind))
        return changeView(record);
    requireCondition(
        record.state.kind === "proposed",
        "conflict",
        "Prepare a new proposal before applying this change.",
        409,
    );
    const approval: ContentChangeApproval = {
        userId: ctx.user.userId,
        at: new Date().toISOString(),
        version,
        previewHash,
    };
    const operationId = randomUUID();
    let claimed;
    try {
        await ContentChangeModel.init();
        claimed = await ContentChangeModel.findOneAndUpdate(
            {
                domain: ctx.subdomain._id,
                id,
                version,
                previewHash,
                "state.kind": "proposed",
            },
            {
                $set: {
                    state: { kind: "applying", operationId, approval },
                    activeTarget: `lesson:${record.target.lessonId}`,
                },
                $push: { approvals: approval },
            },
            { new: true },
        );
    } catch (error) {
        if ((error as { code?: number }).code === 11000)
            throw new ContentChangeError(
                "target_busy",
                "Another change to this lesson is awaiting its result. Reconcile that change first.",
                409,
            );
        throw error;
    }
    if (!claimed) return changeView(await getChange(id, ctx));
    try {
        const lesson = await editableLesson(record.target.lessonId, ctx);
        if (
            lessonRevision(lesson) !== record.baseline.revision ||
            lessonFingerprint(lesson) !== record.baseline.fingerprint
        ) {
            return settle(claimed, {
                kind: "stale",
                reason: "The lesson changed after this preview. Prepare a new version.",
            });
        }
        const patch = {
            id: record.target.lessonId,
            ...record.patch,
            ...(record.patch.content
                ? { content: JSON.stringify(record.patch.content) }
                : {}),
        } as LessonWithStringContent & { id: string; lessonId: string };
        await updateLesson(patch, ctx, {
            revision: record.baseline.revision,
            fingerprint: record.baseline.fingerprint,
            operationId,
        });
    } catch (error) {
        if (error instanceof ContentChangeError && error.code === "stale")
            return settle(claimed, { kind: "stale", reason: error.message });
        // Any unexpected interruption may have happened after Mongo committed. Read the
        // receipt before deciding; if the database is unavailable the applying lock survives.
        return reconcileChange(id, ctx);
    }
    return reconcileChange(id, ctx);
}
