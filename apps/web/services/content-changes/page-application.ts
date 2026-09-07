import { randomUUID } from "crypto";
import type { ContentChangeApproval } from "@courselit/common-models";
import type { InternalPageContentChange } from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import PageModel from "@/models/Page";
import { applyApprovedPageWidget } from "@/graphql/pages/approved-widget";
import { ContentChangeModel } from "./models";
import { changeView, getChange } from "./proposals";
import { requirePageEditor } from "./page-adapter";
import { pageRevision, pageWriteFilter } from "./page-guard";
import type { EditablePage } from "./page-types";
import { ContentChangeError, requireCondition } from "./errors";
import { settle } from "./settle";
import { isPageRecord } from "./adapters";

export async function reconcilePageChange(
    record: InternalPageContentChange,
    ctx: GQLContext,
) {
    requirePageEditor(ctx);
    const state = record.state;
    if (state.kind !== "applying" && state.kind !== "uncertain")
        return changeView(record);
    const page = (await PageModel.findOne({
        domain: ctx.subdomain._id,
        _id: record.baseline.documentId,
    }).lean()) as unknown as EditablePage | null;
    if (!page)
        return settle(
            record,
            {
                ...state,
                kind: "uncertain",
                reason: "The approved page is no longer available. Keep this proposal for review; do not repeat its write.",
            },
            true,
        );
    const receipt = page.contentChangeReceipt;
    if (
        receipt?.operationId === state.operationId &&
        receipt.outcome === "applied"
    )
        return settle(record, {
            kind: "applied",
            operationId: state.operationId,
            approval: state.approval,
            appliedAt: receipt.appliedAt,
            appliedRevision: receipt.revision,
        });
    if (
        (receipt?.operationId === state.operationId &&
            receipt.outcome === "cancelled") ||
        pageRevision(page) > record.baseline.revision
    )
        return settle(record, {
            kind: "failed",
            reason: "This operation did not leave an applied receipt and its old write is fenced out. Prepare a fresh version.",
        });
    // Only the revision and receipt change. A delayed old CAS can no longer write.
    const fenced = await PageModel.findOneAndUpdate(
        pageWriteFilter(page),
        {
            $inc: { __v: 1 },
            $set: {
                contentChangeReceipt: {
                    outcome: "cancelled",
                    operationId: state.operationId,
                    revision: pageRevision(page) + 1,
                    appliedAt: new Date().toISOString(),
                },
            },
        },
        { new: true },
    ).lean();
    if (fenced)
        return settle(record, {
            kind: "failed",
            reason: "The interrupted operation was cancelled before it changed the page. Prepare a new preview to retry.",
        });
    // Preserve the target lock until a subsequent read proves which write won.
    return settle(
        record,
        {
            ...state,
            kind: "uncertain",
            reason: "The page changed during recovery. Check this same proposal again to reconcile its receipt.",
        },
        true,
    );
}
export async function approvePageChange(
    record: InternalPageContentChange,
    version: number,
    previewHash: string,
    ctx: GQLContext,
) {
    requirePageEditor(ctx);
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
        "Prepare a new version before applying this change.",
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
                id: record.id,
                version,
                previewHash,
                "state.kind": "proposed",
            },
            {
                $set: {
                    state: { kind: "applying", operationId, approval },
                    activeTarget: `page:${record.baseline.documentId}`,
                },
                $push: { approvals: approval },
            },
            { new: true },
        );
    } catch (error) {
        if ((error as { code?: number }).code === 11000)
            throw new ContentChangeError(
                "target_busy",
                "Another page change is awaiting its result. Reconcile it first.",
                409,
            );
        throw error;
    }
    if (!claimed) return changeView(await getChange(record.id, ctx));
    requireCondition(
        isPageRecord(claimed),
        "conflict",
        "The proposal target changed.",
        409,
    );
    try {
        await applyApprovedPageWidget(record.target, record, operationId, ctx);
    } catch (error) {
        if (error instanceof ContentChangeError && error.code === "stale")
            return settle(claimed, { kind: "stale", reason: error.message });
        return reconcilePageChange(claimed, ctx);
    }
    return reconcilePageChange(claimed, ctx);
}
