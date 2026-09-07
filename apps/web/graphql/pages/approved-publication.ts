import type GQLContext from "@/models/GQLContext";
import type { EditablePage } from "@/services/content-changes/page-types";
import type { PagePublicationGuard } from "@/services/content-changes/page-publication-types";
import {
    pageFingerprint,
    pageRevision,
} from "@/services/content-changes/page-guard";
import { requirePageEditor } from "@/services/content-changes/page-adapter";
import { requireCondition } from "@/services/content-changes/errors";
import { ContentChangeModel } from "@/services/content-changes/models";
import { isPagePublicationRecord } from "@/services/content-changes/page-publication-types";
import { readDraftPublicationContext } from "./draft-publication";

export async function assertApprovedPublication(
    page: EditablePage,
    guard: PagePublicationGuard,
    ctx: GQLContext,
) {
    requirePageEditor(ctx);
    const record = await ContentChangeModel.findOne({
        domain: ctx.subdomain._id,
        id: guard.receipt.changeId,
    });
    requireCondition(
        record &&
            isPagePublicationRecord(record) &&
            (record.state.kind === "applying" ||
                record.state.kind === "uncertain") &&
            record.state.operationId === guard.receipt.operationId &&
            record.state.approval.userId === ctx.user.userId &&
            record.version === guard.receipt.version &&
            record.previewHash === guard.receipt.previewHash &&
            record.baseline.documentId === guard.documentId &&
            record.baseline.revision === guard.revision &&
            record.baseline.fingerprint === guard.fingerprint &&
            record.baseline.contextFingerprint === guard.contextFingerprint &&
            record.target.creationChangeId === guard.creationChangeId &&
            record.target.pageId === page.pageId &&
            guard.receipt.outcome === "applied" &&
            guard.receipt.revision === guard.revision + 1,
        "forbidden",
        "This exact publication has not been approved by the current administrator.",
        403,
    );
    requireCondition(
        String(page.domain) === String(ctx.subdomain._id) &&
            String(
                (page as EditablePage & { _id?: unknown })._id || page.id,
            ) === guard.documentId &&
            page.draftOnly === true &&
            !page.deleted &&
            page.creationReceipt?.changeId === guard.creationChangeId &&
            pageRevision(page) === guard.revision &&
            pageFingerprint(page) === guard.fingerprint,
        "stale",
        "The current draft changed. Prepare and review its publication again.",
        409,
    );
    const context = await readDraftPublicationContext(ctx);
    requireCondition(
        context.fingerprint === guard.contextFingerprint &&
            !Object.values(context.globalDrafts).some(Boolean),
        "stale",
        "The site appearance or global drafts changed. Resolve pending site-wide drafts and prepare a fresh publication review.",
        409,
    );
}
