import type GQLContext from "@/models/GQLContext";
import PageModel from "@/models/Page";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import { readDraftPublicationContext } from "@/graphql/pages/draft-publication";
import { SITE_HEADER_WIDGET, SITE_FOOTER_WIDGET } from "@/config/site-chrome";
import { ContentChangeModel } from "./models";
import { changeView, getChange, versionView } from "./proposals";
import { requirePageEditor } from "./page-adapter";
import { requireCondition } from "./errors";
import { pageFingerprint, pageRevision } from "./page-guard";
import { fingerprint } from "./stable";
import { validateTextEdit } from "./text-safety";
import { isPageCreationRecord } from "./page-creation-types";
import {
    isPagePublicationRecord,
    type PagePublicationChange,
} from "./page-publication-types";

/** Publication is derived from the saved native draft, never caller-supplied content. */
export async function preparePublicationReview(
    id: string,
    version: number,
    ctx: GQLContext,
) {
    requirePageEditor(ctx);
    return withAccountWrite(
        {
            domainId: String(ctx.subdomain._id),
            userId: ctx.user.userId,
            purpose: "page-publication-proposal",
        },
        async () => {
            const source = await getChange(id, ctx);
            requireCondition(
                source.version === version,
                "conflict",
                "This proposal changed. Refresh before reviewing publication.",
                409,
            );
            requireCondition(
                (isPageCreationRecord(source) &&
                    source.state.kind === "applied") ||
                    (isPagePublicationRecord(source) &&
                        ["proposed", "stale", "failed", "rejected"].includes(
                            source.state.kind,
                        )),
                "unsupported_action",
                "Only a created unpublished page can prepare publication; reconcile an interrupted publication first.",
                409,
            );
            if (isPageCreationRecord(source)) {
                const existing = await ContentChangeModel.findOne({
                    domain: ctx.subdomain._id,
                    id: `publication-${source.id}`,
                });
                if (existing) return changeView(existing);
            }
            requireCondition(
                source.history.length < 20,
                "revision_limit",
                "This proposal has reached its revision limit.",
                409,
            );
            const target = {
                kind: "page-publish" as const,
                pageId: source.target.pageId,
                creationChangeId: isPageCreationRecord(source)
                    ? source.id
                    : source.target.creationChangeId,
            };
            const page = await PageModel.findOne({
                _id: source.baseline.documentId,
                domain: ctx.subdomain._id,
                pageId: target.pageId,
                deleted: { $ne: true },
                draftOnly: true,
            });
            requireCondition(
                page &&
                    page.creationReceipt?.changeId ===
                        target.creationChangeId &&
                    page.creationReceipt.outcome === "created" &&
                    page.type === "site",
                "stale",
                "This original unpublished page is no longer available. A reused address is a different page.",
                409,
            );
            const layout = JSON.parse(JSON.stringify(page.draftLayout || []));
            // This proposal lane promises an exact text-page preview. Do not mount arbitrary
            // interactive/private widgets or silently omit an unreviewed asset.
            requireCondition(
                layout.length > 0 &&
                    page.layout.length === 0 &&
                    !page.socialImage?.mediaId &&
                    !page.draftSocialImage?.mediaId,
                "unsupported_target",
                "This publication review supports text pages without social images.",
                409,
            );
            requireCondition(
                layout.length >= 3 &&
                    layout[0].shared &&
                    layout[0].name === SITE_HEADER_WIDGET &&
                    layout[layout.length - 1].shared &&
                    layout[layout.length - 1].name === SITE_FOOTER_WIDGET &&
                    layout.slice(1, -1).every((widget) => !widget.shared),
                "unsupported_target",
                "This review requires the existing header, text body and footer in their original order.",
                409,
            );
            for (const widget of layout) {
                requireCondition(
                    widget.shared
                        ? [SITE_HEADER_WIDGET, SITE_FOOTER_WIDGET].includes(
                              widget.name,
                          )
                        : widget.name === "rich-text",
                    "unsupported_target",
                    "This draft now contains a block outside the text-page publication review.",
                    409,
                );
                if (!widget.shared)
                    validateTextEdit(
                        { type: "doc", content: [] },
                        widget.settings?.text,
                    );
            }
            const context = await readDraftPublicationContext(ctx);
            const next = {
                version: isPageCreationRecord(source) ? 1 : version + 1,
                summary: `Publish ${page.draftTitle || page.title || page.name}`,
                patch: { kind: "page-publish" as const },
                baseline: {
                    kind: "page-publish" as const,
                    documentId: String(page._id),
                    revision: pageRevision(page),
                    fingerprint: pageFingerprint(page),
                    contextFingerprint: context.fingerprint,
                },
                preview: {
                    title: page.draftTitle || page.title || "",
                    path: `/p/${page.pageId}`,
                    description:
                        page.draftDescription || page.description || "",
                    robotsAllowed:
                        typeof page.draftRobotsAllowed === "boolean"
                            ? page.draftRobotsAllowed
                            : !!page.robotsAllowed,
                    layout,
                    theme: context.theme,
                    typefaces: context.typefaces,
                    globalDrafts: context.globalDrafts,
                },
                preparedBy: ctx.user.userId,
                preparedAt: new Date().toISOString(),
            };
            const prepared = {
                ...next,
                previewHash: fingerprint({ target, ...next }),
            };
            if (isPageCreationRecord(source)) {
                // A deterministic identity also recovers an interrupted preparation response.
                const proposalId = `publication-${source.id}`;
                await ContentChangeModel.init();
                await ContentChangeModel.updateOne(
                    { domain: ctx.subdomain._id, id: proposalId },
                    {
                        $setOnInsert: {
                            domain: ctx.subdomain._id,
                            id: proposalId,
                            target,
                            ...prepared,
                            state: { kind: "proposed" },
                            history: [],
                        },
                    },
                    { upsert: true },
                );
                return changeView(await getChange(proposalId, ctx));
            }
            const saved = await ContentChangeModel.findOneAndUpdate(
                {
                    domain: ctx.subdomain._id,
                    id,
                    version,
                    "state.kind": source.state.kind,
                },
                {
                    $set: { ...prepared, state: { kind: "proposed" } },
                    $push: { history: versionView(source) },
                },
                { new: true },
            );
            requireCondition(
                saved,
                "conflict",
                "This proposal changed. Refresh before reviewing publication.",
                409,
            );
            return changeView(saved) as PagePublicationChange;
        },
    );
}
