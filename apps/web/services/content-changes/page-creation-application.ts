import { randomUUID } from "crypto";
import type GQLContext from "@/models/GQLContext";
import PageModel from "@/models/Page";
import {
    applyApprovedPageDraft,
    cancelledPageIdentity,
} from "@/graphql/pages/approved-draft";
import { ContentChangeModel } from "./models";
import { changeView, getChange } from "./proposals";
import { settle } from "./settle";
import { requirePageEditor } from "./page-adapter";
import { ContentChangeError, requireCondition } from "./errors";
import {
    isPageCreationRecord,
    type PageCreationRecord,
} from "./page-creation-types";

export async function reconcilePageCreation(
    record: PageCreationRecord,
    ctx: GQLContext,
) {
    requirePageEditor(ctx);
    requireCondition(
        String(record.domain) === String(ctx.subdomain._id),
        "forbidden",
        "This creation belongs to another site.",
        403,
    );
    const state = record.state;
    if (state.kind !== "applying" && state.kind !== "uncertain")
        return changeView(record);
    try {
        // Cancellation and a delayed create compete for the SAME immutable Mongo identity.
        // A read miss alone is never proof that the original insert cannot still commit.
        await PageModel.init();
        await PageModel.updateOne(
            { _id: record.baseline.documentId, domain: ctx.subdomain._id },
            {
                $setOnInsert: cancelledPageIdentity(
                    record,
                    state.operationId,
                    ctx,
                ),
            },
            { upsert: true },
        );
        const page = await PageModel.findOne({
            _id: record.baseline.documentId,
            domain: ctx.subdomain._id,
        });
        const receipt = page?.creationReceipt;
        if (
            receipt?.changeId === record.id &&
            receipt.version === record.version &&
            receipt.operationId === state.operationId &&
            receipt.previewHash === record.previewHash
        ) {
            if (receipt.outcome === "created")
                return settle(record, {
                    kind: "applied",
                    operationId: state.operationId,
                    approval: state.approval,
                    appliedAt: receipt.at,
                    appliedRevision: 0,
                });
            if (receipt.outcome === "cancelled")
                return settle(record, {
                    kind: "failed",
                    reason: "No page was created by this operation. Its delayed write is cancelled. Review a new version to retry; a page address may now be occupied.",
                });
        }
    } catch {
        // A database error or competing insert is ambiguous. Retain the lock and retry reads.
    }
    return settle(
        record,
        {
            ...state,
            kind: "uncertain",
            reason: "The page creation result is not yet confirmed. Check this same proposal again; do not submit a duplicate.",
        },
        true,
    );
}
export async function approvePageCreation(
    record: PageCreationRecord,
    version: number,
    previewHash: string,
    ctx: GQLContext,
) {
    requirePageEditor(ctx);
    requireCondition(
        String(record.domain) === String(ctx.subdomain._id),
        "forbidden",
        "This creation belongs to another site.",
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
        "Prepare a new version before creating this page.",
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
                    activeTarget: `page-route:${record.target.pageId}`,
                },
                $push: { approvals: approval },
            },
            { new: true },
        );
    } catch (error) {
        if ((error as { code?: number }).code === 11000)
            throw new ContentChangeError(
                "target_busy",
                "Another creation at this address is awaiting its result. Reconcile it first.",
                409,
            );
        throw error;
    }
    if (!claimed) return changeView(await getChange(record.id, ctx));
    requireCondition(
        isPageCreationRecord(claimed),
        "conflict",
        "The proposal target changed.",
        409,
    );
    try {
        await applyApprovedPageDraft(claimed, operationId, ctx);
    } catch (error) {
        if (error instanceof ContentChangeError && error.code === "stale")
            return settle(claimed, { kind: "stale", reason: error.message });
        return reconcilePageCreation(claimed, ctx);
    }
    return reconcilePageCreation(claimed, ctx);
}
