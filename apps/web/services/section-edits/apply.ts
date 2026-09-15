import type {
    SectionEditInput,
    SectionEditResult,
} from "@courselit/common-models";
import type { InternalSectionEdit } from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import PageModel from "@/models/Page";
import {
    editablePage,
    requirePageEditor,
} from "@/services/content-changes/page-adapter";
import {
    pageFingerprint,
    pageRevision,
    pageWriteFilter,
} from "@/services/content-changes/page-guard";
import {
    ContentChangeError,
    requireCondition,
} from "@/services/content-changes/errors";
import { fingerprint } from "@/services/content-changes/stable";
import {
    captureSection,
    changedLayouts,
    positionOf,
    sectionLabel,
    widgetFingerprint,
} from "./layout";
import {
    documentId,
    findRecord,
    recoverPageReceipts,
    requireAppliedRecord,
    settleApplied,
    view,
} from "./records";
import { SectionEditModel } from "./model";
import { sectionEditInput } from "./validation";
import { retainAbsentNeighbors } from "./ordering";

async function prepare(input: SectionEditInput, ctx: GQLContext) {
    const original =
        input.action === "reverse"
            ? await requireAppliedRecord(input.editId, ctx)
            : undefined;
    const target = input.action === "remove" ? input.target : original!.target;
    const page = await editablePage(target.pageId, ctx);
    requireCondition(
        documentId(page) === target.documentId && !page.draftOnly,
        "stale",
        "This is no longer the same published page. Refresh before making changes.",
        409,
    );
    await recoverPageReceipts(page);
    const action = original?.action === "remove" ? "restore" : "remove";
    const snapshot =
        action === "restore"
            ? original!.snapshot
            : captureSection(page, target.widgetId);
    if (
        action === "restore" &&
        snapshot.draft.kind === "mirrored" &&
        !page.draftLayout?.length
    )
        requireCondition(
            pageRevision(page) === original!.revision,
            "draft_conflict",
            "The unpublished draft changed after this removal. Resolve the draft before restoring the section.",
            409,
        );
    if (action === "remove") {
        const expected =
            input.action === "remove"
                ? input.fingerprint
                : widgetFingerprint(original!.widget);
        requireCondition(
            widgetFingerprint(snapshot.published.widget) === expected,
            "stale",
            "This section changed. Refresh and review it before removing it.",
            409,
        );
    }
    const layouts = changedLayouts(page, snapshot, action);
    // A restoration records its actual new placement, so reversing it preserves later ordering.
    const retained = await retainAbsentNeighbors(
        action === "restore" ? { ...page, ...layouts } : page,
        action === "restore"
            ? captureSection({ ...page, ...layouts }, target.widgetId)
            : snapshot,
    );
    return {
        domain: ctx.subdomain._id,
        editId: input.requestId,
        inputHash: fingerprint(input),
        target,
        action,
        widgetName: retained.published.widget.name,
        label: sectionLabel(retained.published.widget),
        widget: retained.published.widget,
        position: positionOf(retained.published),
        snapshot: retained,
        userId: ctx.user.userId,
        at: new Date().toISOString(),
        revision: pageRevision(page) + 1,
        baselineRevision: pageRevision(page),
        baselineFingerprint: pageFingerprint(page),
        ...(original ? { undoOf: original.editId } : {}),
        state: { kind: "applying" },
    };
}

async function failed(row: InternalSectionEdit, ctx: GQLContext) {
    // A simultaneous retry may have won the page CAS or settled its receipt already.
    if (
        await PageModel.exists({
            _id: row.target.documentId,
            domain: row.domain,
            sectionEditReceipts: row.editId,
        })
    )
        return settleApplied(row);
    const latest = await findRecord(row.editId, ctx);
    if (latest?.state.kind === "applied") return latest;
    const state = {
        kind: "failed",
        code: "stale",
        message: "The page changed while saving. Refresh before trying again.",
    };
    await SectionEditModel.updateOne(
        { domain: row.domain, editId: row.editId, "state.kind": "applying" },
        { $set: { state } },
    );
    throw new ContentChangeError(state.code, state.message, 409);
}

/** Replays use the same immutable operation and native document, never a fresh deletion. */
async function resume(
    row: InternalSectionEdit,
    ctx: GQLContext,
): Promise<SectionEditResult> {
    if (row.state.kind === "applied")
        return { kind: "applied", edit: view(row) };
    if (row.state.kind === "failed")
        throw new ContentChangeError(row.state.code, row.state.message, 409);
    if (
        await PageModel.exists({
            _id: row.target.documentId,
            domain: row.domain,
            sectionEditReceipts: row.editId,
        })
    )
        return { kind: "applied", edit: view(await settleApplied(row)) };
    const page = await editablePage(row.target.pageId, ctx);
    if (
        documentId(page) !== row.target.documentId ||
        page.draftOnly ||
        pageRevision(page) !== row.baselineRevision ||
        pageFingerprint(page) !== row.baselineFingerprint
    )
        return { kind: "applied", edit: view(await failed(row, ctx)) };
    const layouts = changedLayouts(page, row.snapshot, row.action);
    // The retained operation is written before this CAS. Page and receipt are one write.
    // Recasting these already-stored arrays rejects untouched legacy block IDs.
    const saved = await PageModel.collection.updateOne(pageWriteFilter(page), {
        $set: { ...layouts, updatedAt: new Date() },
        $inc: { __v: 1 },
        $addToSet: { sectionEditReceipts: row.editId },
    });
    const settled =
        saved.modifiedCount === 1
            ? await settleApplied(row)
            : await failed(row, ctx);
    return { kind: "applied", edit: view(settled) };
}

export async function applySectionEdit(
    raw: SectionEditInput,
    ctx: GQLContext,
): Promise<SectionEditResult> {
    requirePageEditor(ctx);
    const input = sectionEditInput.parse(raw);
    await SectionEditModel.init();
    let row = await findRecord(input.requestId, ctx);
    if (!row) {
        try {
            const prepared = await prepare(input, ctx);
            row = (await SectionEditModel.create(prepared)).toObject();
        } catch (error) {
            // Another delivery of this request may already have changed the
            // page between our initial lookup and preparation.
            row = await findRecord(input.requestId, ctx);
            if (!row) throw error;
        }
    }
    requireCondition(
        row &&
            row.inputHash === fingerprint(input) &&
            row.userId === ctx.user.userId,
        "idempotency_conflict",
        "This request ID already belongs to a different action.",
        409,
    );
    return resume(row, ctx);
}
