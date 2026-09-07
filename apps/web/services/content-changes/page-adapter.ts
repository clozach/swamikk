import { checkPermission } from "@courselit/utils";
import { UIConstants } from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import PageModel from "@/models/Page";
import { getTheme } from "@/graphql/themes/logic";
import type {
    PageWidgetChangeInput,
    PageWidgetChangeVersion,
} from "@courselit/common-models";
import type { EditablePage } from "./page-types";
import {
    pageField,
    pagePreviewSettings,
    pageWidgetFields,
    pageWidgetSnapshot,
    patchPageWidget,
} from "./page-fields";
import {
    resolvePageImage,
    pageMediaDependencies,
    type PageMediaDependencies,
} from "./page-media";
import { pageFingerprint, pageRevision } from "./page-guard";
import { requireCondition } from "./errors";
import { fingerprint, stableJson } from "./stable";

export async function editablePage(
    pageId: string,
    ctx: GQLContext,
): Promise<EditablePage> {
    requirePageEditor(ctx);
    const page = await PageModel.findOne({
        domain: ctx.subdomain._id,
        pageId,
        deleted: { $ne: true },
    }).lean();
    requireCondition(page, "not_found", "Page not found in this site.", 404);
    return page as unknown as EditablePage;
}
export function requirePageEditor(ctx: GQLContext) {
    requireCondition(
        ctx.user?.active &&
            String(ctx.user.domain) === String(ctx.subdomain._id) &&
            !ctx.memberMimic &&
            checkPermission(ctx.user.permissions, [
                UIConstants.permissions.manageSite,
            ]),
        "forbidden",
        "Exit Member Mimic and sign in with permission to edit this site.",
        403,
    );
}
export function selectedPageWidget(page: EditablePage, widgetId: string) {
    const matches = page.layout.filter(
        (widget) => widget.widgetId === widgetId,
    );
    requireCondition(
        matches.length === 1 && !matches[0].shared,
        "unsupported_target",
        "Choose one existing non-shared block on the published page.",
    );
    return matches[0];
}
export async function publishedPageRenderContext(ctx: GQLContext) {
    const native = await getTheme(ctx);
    requireCondition(
        native?.theme,
        "unavailable",
        "The published theme could not be loaded for this preview.",
        503,
    );
    return {
        theme: JSON.parse(
            JSON.stringify({
                id: native.themeId,
                name: native.name,
                theme: native.theme,
            }),
        ),
        typefaces: JSON.parse(JSON.stringify(ctx.subdomain.typefaces || [])),
    };
}
export async function pageRenderFingerprint(
    page: EditablePage,
    widgetId: string,
    ctx: GQLContext,
) {
    const rendering = await publishedPageRenderContext(ctx);
    return {
        ...rendering,
        hash: fingerprint({
            ...rendering,
            fields: pageWidgetFields(selectedPageWidget(page, widgetId)),
            renderSettings: pagePreviewSettings(
                selectedPageWidget(page, widgetId),
            ),
            sharedWidgets: ctx.subdomain.sharedWidgets || {},
        }),
    };
}
export async function preparePageSnapshotVersion(
    input: PageWidgetChangeInput,
    version: number,
    page: EditablePage,
    preparedBy: string,
    readRendering: () => Promise<
        Awaited<ReturnType<typeof pageRenderFingerprint>>
    >,
    options: { recovery?: boolean; resolveImage?: () => Promise<unknown> } = {},
): Promise<PageWidgetChangeVersion> {
    const widget = selectedPageWidget(page, input.target.widgetId);
    const before = pageWidgetSnapshot(widget, input.target.field);
    const draft = page.draftLayout?.length
        ? page.draftLayout.find((item) => item.widgetId === widget.widgetId)
        : undefined;
    if (page.draftLayout?.length)
        requireCondition(
            draft &&
                !draft.shared &&
                draft.name === widget.name &&
                stableJson(pageField(draft, input.target.field).value) ===
                    stableJson(before.fieldValue),
            "draft_conflict",
            "An unpublished draft already changes this selected field. Keep that draft and resolve it before preparing this edit.",
            409,
        );
    const image =
        input.patch.kind === "image"
            ? await options.resolveImage?.()
            : undefined;
    const afterWidget = patchPageWidget(
        widget,
        input.target.field,
        input.patch,
        image,
        !!options.recovery,
    );
    const after = pageWidgetSnapshot(afterWidget, input.target.field);
    const rendering = await readRendering();
    const baseline: PageWidgetChangeVersion["baseline"] = {
        kind: "page-widget",
        documentId: String(
            (page as EditablePage & { _id?: unknown })._id || page.id,
        ),
        revision: pageRevision(page),
        fingerprint: pageFingerprint(page),
        renderFingerprint: rendering.hash,
        snapshot: before,
        pageType: page.type,
        theme: rendering.theme,
        typefaces: rendering.typefaces,
        draft: draft ? "mirrored-leaf" : "absent",
        published: true,
    };
    const preview = { before, after };
    return {
        version,
        summary: input.summary,
        patch: input.patch,
        baseline,
        preview,
        previewHash: fingerprint({
            target: input.target,
            feedbackId: input.feedbackId,
            version,
            summary: input.summary,
            patch: input.patch,
            baseline,
            preview,
        }),
        preparedBy,
        preparedAt: new Date().toISOString(),
    };
}

/** Existing administrator entry point retains authorization and native media handling. */
export async function preparePageVersion(
    input: PageWidgetChangeInput,
    version: number,
    ctx: GQLContext,
    options: { recovery?: boolean; media?: PageMediaDependencies } = {},
): Promise<PageWidgetChangeVersion> {
    const page = await editablePage(input.target.pageId, ctx);
    return preparePageSnapshotVersion(
        input,
        version,
        page,
        ctx.user.userId,
        () => pageRenderFingerprint(page, input.target.widgetId, ctx),
        {
            recovery: options.recovery,
            resolveImage: async () =>
                input.patch.kind === "image"
                    ? resolvePageImage(
                          input.patch.mediaId,
                          input.patch.alt,
                          selectedPageWidget(page, input.target.widgetId),
                          ctx,
                          options.media || pageMediaDependencies,
                      )
                    : undefined,
        },
    );
}
