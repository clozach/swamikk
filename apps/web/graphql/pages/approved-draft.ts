import PageModel from "@/models/Page";
import type GQLContext from "@/models/GQLContext";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import { requirePageEditor } from "@/services/content-changes/page-adapter";
import { pageCreationRenderContext } from "@/services/content-changes/page-creation-adapter";
import type { PageCreationRecord } from "@/services/content-changes/page-creation-types";
import { requireCondition } from "@/services/content-changes/errors";

/** Native, server-only insert. Receipt and the complete hidden draft commit together. */
export async function applyApprovedPageDraft(
    record: PageCreationRecord,
    operationId: string,
    ctx: GQLContext,
) {
    requirePageEditor(ctx);
    requireCondition(
        String(record.domain) === String(ctx.subdomain._id) &&
            (record.state.kind === "applying" ||
                record.state.kind === "uncertain") &&
            record.state.operationId === operationId &&
            record.state.approval.userId === ctx.user.userId &&
            record.state.approval.version === record.version &&
            record.state.approval.previewHash === record.previewHash,
        "forbidden",
        "This exact page creation has not been approved by the current administrator in this site.",
        403,
    );
    return withAccountWrite(
        {
            domainId: String(ctx.subdomain._id),
            userId: ctx.user.userId,
            purpose: "approved-page-draft",
        },
        async () => {
            const rendering = await pageCreationRenderContext(ctx);
            requireCondition(
                rendering.hash === record.baseline.renderFingerprint,
                "stale",
                "The published site appearance changed. Prepare and review a fresh proposal.",
                409,
            );
            await PageModel.init();
            // Never upsert. A cancelled/erased identity must permanently reject a late insert.
            return PageModel.create({
                _id: record.baseline.documentId,
                domain: ctx.subdomain._id,
                pageId: record.target.pageId,
                type: "site",
                entityId: ctx.subdomain.name,
                creatorId: ctx.user.userId,
                name: record.preview.title,
                deleteable: true,
                draftOnly: true,
                deleted: false,
                layout: [],
                draftLayout: record.preview.layout,
                draftTitle: record.preview.title,
                robotsAllowed: false,
                draftRobotsAllowed: true,
                creationReceipt: {
                    outcome: "created",
                    changeId: record.id,
                    version: record.version,
                    operationId,
                    previewHash: record.previewHash,
                    at: new Date().toISOString(),
                },
            });
        },
    );
}

/** An erased row owns the immutable ID, but releases the requested route. */
export function cancelledPageIdentity(
    record: PageCreationRecord,
    operationId: string,
    ctx: GQLContext,
) {
    return {
        _id: record.baseline.documentId,
        domain: ctx.subdomain._id,
        pageId: `removed-${record.baseline.documentId}`,
        type: "site",
        creatorId: ctx.user.userId,
        name: "Removed page",
        deleteable: false,
        deleted: true,
        draftOnly: true,
        layout: [],
        draftLayout: [],
        robotsAllowed: false,
        creationReceipt: {
            outcome: "cancelled",
            changeId: record.id,
            version: record.version,
            operationId,
            previewHash: record.previewHash,
            at: new Date().toISOString(),
        },
    };
}
