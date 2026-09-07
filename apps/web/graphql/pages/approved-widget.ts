import type GQLContext from "@/models/GQLContext";
import PageModel from "@/models/Page";
import type {
    PageWidgetTarget,
    PageWidgetChangeVersion,
} from "@courselit/common-models";
import {
    editablePage,
    selectedPageWidget,
    pageRenderFingerprint,
} from "@/services/content-changes/page-adapter";
import {
    pageFingerprint,
    pageRevision,
    pageWriteFilter,
} from "@/services/content-changes/page-guard";
import {
    mirrorPageWidgetValue,
    pageWidgetSnapshot,
} from "@/services/content-changes/page-fields";
import {
    verifyPageImage,
    pageMediaDependencies,
    type PageMediaDependencies,
} from "@/services/content-changes/page-media";
import { requireCondition } from "@/services/content-changes/errors";
import { stableJson } from "@/services/content-changes/stable";

/** Native one-block edit: published leaf + matching draft leaf + receipt commit together.
 * It never promotes unrelated page drafts or writes shared widgets, typefaces or themes. */
export async function applyApprovedPageWidget(
    target: PageWidgetTarget,
    version: PageWidgetChangeVersion,
    operationId: string,
    ctx: GQLContext,
    media: PageMediaDependencies = pageMediaDependencies,
) {
    const page = await editablePage(target.pageId, ctx);
    requireCondition(
        String((page as typeof page & { _id?: unknown })._id || page.id) ===
            version.baseline.documentId &&
            pageRevision(page) === version.baseline.revision &&
            pageFingerprint(page) === version.baseline.fingerprint &&
            (await pageRenderFingerprint(page, target.widgetId, ctx)).hash ===
                version.baseline.renderFingerprint,
        "stale",
        "The page, draft or preview context changed. Prepare a fresh review.",
        409,
    );
    const current = selectedPageWidget(page, target.widgetId);
    requireCondition(
        stableJson(pageWidgetSnapshot(current, target.field)) ===
            stableJson(version.preview.before),
        "stale",
        "The selected field changed after this preview.",
        409,
    );
    if (
        version.patch.kind === "image" ||
        version.patch.kind === "restore-widget"
    )
        await verifyPageImage(
            version.preview.after.fieldValue,
            current,
            ctx,
            media,
        );
    const after = version.preview.after.widget;
    requireCondition(
        after.widgetId === current.widgetId &&
            after.name === current.name &&
            after.shared === current.shared,
        "bad_request",
        "The selected block identity cannot change.",
    );
    const layout = page.layout.map((widget) =>
        widget.widgetId === target.widgetId
            ? { ...widget, settings: after.settings }
            : widget,
    );
    const draftLayout = page.draftLayout?.map((widget) => {
        if (widget.widgetId !== target.widgetId) return widget;
        return mirrorPageWidgetValue(widget, after, target.field);
    });
    const saved = await PageModel.findOneAndUpdate(
        pageWriteFilter(page),
        {
            $set: {
                layout,
                ...(draftLayout?.length ? { draftLayout } : {}),
                contentChangeReceipt: {
                    outcome: "applied",
                    operationId,
                    revision: pageRevision(page) + 1,
                    appliedAt: new Date().toISOString(),
                },
            },
            $inc: { __v: 1 },
        },
        { new: true, runValidators: true },
    ).lean();
    requireCondition(
        saved,
        "stale",
        "The page changed while this approval was being applied. Your draft is preserved.",
        409,
    );
    return saved;
}
