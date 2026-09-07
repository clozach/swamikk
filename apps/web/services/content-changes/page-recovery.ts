import type { InternalPageContentChange } from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import {
    editablePage,
    selectedPageWidget,
    preparePageVersion,
} from "./page-adapter";
import { pageRevision } from "./page-guard";
import { stableJson } from "./stable";
import { requireCondition } from "./errors";

export async function preparePageRecovery(
    original: InternalPageContentChange,
    ctx: GQLContext,
) {
    const page = await editablePage(original.target.pageId, ctx);
    requireCondition(
        original.state.kind === "applied" &&
            String((page as typeof page & { _id?: unknown })._id || page.id) ===
                original.baseline.documentId &&
            pageRevision(page) === original.state.appliedRevision &&
            stableJson(
                selectedPageWidget(page, original.target.widgetId).settings ||
                    {},
            ) === stableJson(original.preview.after.widget.settings || {}),
        "stale",
        "The page changed again. Prepare a new proposal that preserves the later edits.",
        409,
    );
    return preparePageVersion(
        {
            target: original.target,
            patch: {
                kind: "restore-widget",
                settings: original.preview.before.widget.settings || {},
            },
            summary: `Restore the previous ${original.target.field} on ${original.target.pageId}`,
        },
        1,
        ctx,
        { recovery: true },
    );
}
