import { randomUUID } from "crypto";
import type GQLContext from "@/models/GQLContext";
import PageModel from "@/models/Page";
import { publish } from "@/graphql/pages/logic";
import { ContentChangeModel } from "./models";
import { changeView, getChange } from "./proposals";
import { requirePageEditor } from "./page-adapter";
import { pageRevision, pageWriteFilter } from "./page-guard";
import { ContentChangeError, requireCondition } from "./errors";
import { settle } from "./settle";
import {
    hasGlobalDrafts,
    isPagePublicationRecord,
    type PagePublicationRecord,
} from "./page-publication-types";

export async function reconcilePagePublication(
    record: PagePublicationRecord,
    ctx: GQLContext,
) {
    requirePageEditor(ctx);
    requireCondition(
        String(record.domain) === String(ctx.subdomain._id),
        "forbidden",
        "This publication belongs to another site.",
        403,
    );
    const state = record.state;
    if (state.kind !== "applying" && state.kind !== "uncertain")
        return changeView(record);
    try {
        const page = await PageModel.findOne({
            domain: ctx.subdomain._id,
            _id: record.baseline.documentId,
        });
        const receipt = page?.publicationReceipt;
        if (
            receipt?.changeId === record.id &&
            receipt.operationId === state.operationId &&
            receipt.version === record.version &&
            receipt.previewHash === record.previewHash
        ) {
            if (receipt.outcome === "applied")
                return settle(record, {
                    kind: "applied",
                    operationId: state.operationId,
                    approval: state.approval,
                    appliedAt: receipt.at,
                    appliedRevision: receipt.revision,
                });
            return settle(record, {
                kind: "failed",
                reason: "This publication was cancelled before it changed the page. Refresh its review before trying again.",
            });
        }
        if (page && pageRevision(page) > record.baseline.revision)
            return settle(record, {
                kind: "failed",
                reason: "This operation has no publication receipt and its old write is fenced out. Refresh the publication review.",
            });
        if (page) {
            // Update-only: cancellation wins the same page CAS as a delayed publish.
            // Missing/erased records are never recreated by recovery.
            const fenced = await PageModel.findOneAndUpdate(
                pageWriteFilter(page),
                {
                    $inc: { __v: 1 },
                    $set: {
                        publicationReceipt: {
                            outcome: "cancelled",
                            changeId: record.id,
                            operationId: state.operationId,
                            version: record.version,
                            previewHash: record.previewHash,
                            revision: pageRevision(page) + 1,
                            at: new Date().toISOString(),
                        },
                    },
                },
                { new: true },
            );
            if (fenced)
                return settle(record, {
                    kind: "failed",
                    reason: "The interrupted publication was cancelled before it changed the page. Refresh its review to retry.",
                });
        }
    } catch {
        /* Database ambiguity keeps the target lock; never retry publication here. */
    }
    return settle(
        record,
        {
            ...state,
            kind: "uncertain",
            reason: "Publication is not yet confirmed. Check this same proposal again; do not submit another publication.",
        },
        true,
    );
}

export async function approvePagePublication(
    record: PagePublicationRecord,
    version: number,
    previewHash: string,
    ctx: GQLContext,
) {
    requirePageEditor(ctx);
    requireCondition(
        String(record.domain) === String(ctx.subdomain._id),
        "forbidden",
        "This publication belongs to another site.",
        403,
    );
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
        "Refresh this publication review before approving.",
        409,
    );
    requireCondition(
        !hasGlobalDrafts(record.preview.globalDrafts),
        "global_drafts",
        "Resolve the pending site-wide drafts separately, then refresh this publication review.",
        409,
    );
    const approval = {
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
                "Another change to this page is awaiting its result. Reconcile it first.",
                409,
            );
        throw error;
    }
    if (!claimed) return changeView(await getChange(record.id, ctx));
    requireCondition(
        isPagePublicationRecord(claimed),
        "conflict",
        "The proposal target changed.",
        409,
    );
    try {
        await publish(record.target.pageId, ctx, record.baseline.documentId, {
            ...record.baseline,
            creationChangeId: record.target.creationChangeId,
            receipt: {
                outcome: "applied",
                changeId: record.id,
                operationId,
                version,
                previewHash,
                revision: record.baseline.revision + 1,
                at: new Date().toISOString(),
            },
        });
    } catch (error) {
        if (error instanceof ContentChangeError && error.code === "stale")
            return settle(claimed, { kind: "stale", reason: error.message });
        return reconcilePagePublication(claimed, ctx);
    }
    return reconcilePagePublication(claimed, ctx);
}
