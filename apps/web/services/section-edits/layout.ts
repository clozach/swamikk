import type {
    SectionLayoutSnapshot,
    SectionPosition,
    SectionSnapshot,
    WidgetInstance,
} from "@courselit/common-models";
import type { EditablePage } from "@/services/content-changes/page-types";
import { requireCondition } from "@/services/content-changes/errors";
import { fingerprint } from "@/services/content-changes/stable";
import header from "../../../../packages/page-blocks/src/blocks/anahata-header/metadata";
import footer from "../../../../packages/page-blocks/src/blocks/anahata-footer/metadata";
import stockFooter from "../../../../packages/page-blocks/src/blocks/footer/metadata";

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const structural = new Set([
    "header",
    header.name,
    footer.name,
    stockFooter.name,
]);
export const removable = (widget: WidgetInstance) =>
    widget.deleteable === true &&
    !widget.shared &&
    !structural.has(widget.name);
export const widgetFingerprint = (widget: WidgetInstance) =>
    fingerprint({
        widgetId: widget.widgetId,
        name: widget.name,
        shared: widget.shared,
        deleteable: widget.deleteable,
        settings: widget.settings,
    });
export const sectionLabel = (widget: WidgetInstance) => {
    const value = ["heading", "title", "name", "kicker"]
        .map((key) => widget.settings?.[key])
        .find((item) => typeof item === "string" && item.trim());
    return typeof value === "string" ? value.trim().slice(0, 160) : widget.name;
};
export function positionOf(snapshot: SectionLayoutSnapshot): SectionPosition {
    const index = snapshot.order.indexOf(snapshot.widget.widgetId);
    return {
        index,
        beforeId: snapshot.order[index - 1] || null,
        afterId: snapshot.order[index + 1] || null,
    };
}

/** The selected block is complete in both layouts; unrelated draft work remains independent. */
export function captureSection(
    page: EditablePage,
    widgetId: string,
): SectionSnapshot {
    for (const layout of [page.layout, page.draftLayout || []])
        requireCondition(
            new Set(layout.map((item) => item.widgetId)).size === layout.length,
            "order_conflict",
            "This page has duplicate section identities. Resolve them before removing a section.",
            409,
        );
    const selected = page.layout.filter(
        (widget) => widget.widgetId === widgetId,
    );
    requireCondition(
        selected.length === 1 && removable(selected[0]),
        "unsupported_target",
        "Choose a removable section in the page body.",
    );
    const published = {
        widget: clone(selected[0]),
        order: page.layout.map((widget) => widget.widgetId),
    };
    if (!page.draftLayout?.length)
        return { published, draft: { kind: "absent" } };
    const drafts = page.draftLayout.filter(
        (widget) => widget.widgetId === widgetId,
    );
    requireCondition(
        drafts.length === 1 &&
            widgetFingerprint(drafts[0]) === widgetFingerprint(selected[0]),
        "draft_conflict",
        "An unpublished draft changes this section. Resolve that draft before removing it.",
        409,
    );
    return {
        published,
        draft: {
            kind: "mirrored",
            widget: clone(drafts[0]),
            order: page.draftLayout.map((widget) => widget.widgetId),
        },
    };
}

/** Insert beside surviving original neighbors; never move or overwrite another block. */
export function insertSection(
    layout: WidgetInstance[],
    snapshot: SectionLayoutSnapshot,
) {
    const id = snapshot.widget.widgetId;
    const order = layout.map((widget) => widget.widgetId);
    requireCondition(
        new Set(order).size === order.length && !order.includes(id),
        "stale",
        "This section already exists or its neighbors are ambiguous. Refresh the page.",
        409,
    );
    const originalIndex = snapshot.order.indexOf(id);
    requireCondition(
        originalIndex >= 0,
        "unavailable",
        "The section's saved position is unavailable.",
        503,
    );
    const previous = snapshot.order
        .slice(0, originalIndex)
        .reverse()
        .find((item) => order.includes(item));
    const next = snapshot.order
        .slice(originalIndex + 1)
        .find((item) => order.includes(item));
    requireCondition(
        !previous || !next || order.indexOf(previous) < order.indexOf(next),
        "order_conflict",
        "This section's neighbors have changed order. Resolve their order before restoring it.",
        409,
    );
    requireCondition(
        previous || next || order.length === 0,
        "order_conflict",
        "The section's original neighbors are gone. Restore a neighboring section first.",
        409,
    );
    const index = next
        ? order.indexOf(next)
        : previous
          ? order.indexOf(previous) + 1
          : 0;
    const result = [...layout];
    result.splice(index, 0, clone(snapshot.widget));
    return result;
}

export function changedLayouts(
    page: EditablePage,
    snapshot: SectionSnapshot,
    action: "remove" | "restore",
) {
    const id = snapshot.published.widget.widgetId;
    if (action === "remove") {
        // Recheck both copies on a resumed operation as well as initial preparation.
        const current = captureSection(page, id);
        requireCondition(
            widgetFingerprint(current.published.widget) ===
                widgetFingerprint(snapshot.published.widget),
            "stale",
            "The section changed since this action. Refresh and review it again.",
            409,
        );
        return {
            layout: page.layout.filter((widget) => widget.widgetId !== id),
            ...(page.draftLayout?.length
                ? {
                      draftLayout: page.draftLayout.filter(
                          (widget) => widget.widgetId !== id,
                      ),
                  }
                : {}),
        };
    }
    const layout = insertSection(page.layout, snapshot.published);
    if (!page.draftLayout?.length)
        return snapshot.draft.kind === "mirrored"
            ? { layout, draftLayout: insertSection([], snapshot.draft) }
            : { layout };
    requireCondition(
        snapshot.draft.kind === "mirrored",
        "draft_conflict",
        "A new unpublished draft exists. Resolve it before restoring this section.",
        409,
    );
    return {
        layout,
        draftLayout: insertSection(page.draftLayout, snapshot.draft),
    };
}
