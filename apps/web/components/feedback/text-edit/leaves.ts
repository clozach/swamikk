import type {
    PageTextLeaves,
    TextEditTarget,
    TextLeaf,
} from "@courselit/common-models";

/** Whitespace as the browser shows it: one space between words, none at the ends. */
export const normalizeText = (text: string) =>
    text.replace(/ /g, " ").replace(/\s+/g, " ").trim();

export interface WidgetLeafIndex {
    widgetId: string;
    name: string;
    shared: boolean;
    byPath: Map<string, TextLeaf>;
    /** normalized value → every path that reads that way (more than one = ambiguous). */
    byValue: Map<string, string[]>;
}
export type LeafIndex = Map<string, WidgetLeafIndex>;

export function indexLeaves(page: PageTextLeaves): LeafIndex {
    const index: LeafIndex = new Map();
    for (const widget of page.widgets) {
        const byPath = new Map<string, TextLeaf>();
        const byValue = new Map<string, string[]>();
        for (const leaf of widget.leaves) {
            // A copy: saves update the index in place and must never touch the payload.
            byPath.set(leaf.path, { ...leaf });
            const key = normalizeText(leaf.value);
            byValue.set(key, [...(byValue.get(key) || []), leaf.path]);
        }
        index.set(widget.widgetId, {
            widgetId: widget.widgetId,
            name: widget.name,
            shared: widget.shared,
            byPath,
            byValue,
        });
    }
    return index;
}

/** Record a saved value so later matches and edits start from it. */
export function updateLeaf(
    index: LeafIndex,
    widgetId: string,
    path: string,
    value: string,
) {
    const widget = index.get(widgetId);
    const leaf = widget?.byPath.get(path);
    if (!widget || !leaf) return;
    const oldKey = normalizeText(leaf.value);
    const remaining = (widget.byValue.get(oldKey) || []).filter(
        (item) => item !== path,
    );
    if (remaining.length) widget.byValue.set(oldKey, remaining);
    else widget.byValue.delete(oldKey);
    leaf.value = value;
    leaf.source = "settings";
    const key = normalizeText(value);
    widget.byValue.set(key, [...(widget.byValue.get(key) || []), path]);
}

/** The widget id a target's text lives under on this page (shared blocks are keyed by name on the page). */
export function targetWidgetId(index: LeafIndex, target: TextEditTarget) {
    if (target.kind === "page-widget-text") return target.widgetId;
    for (const widget of Array.from(index.values()))
        if (widget.shared && widget.name === target.name)
            return widget.widgetId;
    return undefined;
}

export function leafValue(index: LeafIndex, target: TextEditTarget) {
    const widgetId = targetWidgetId(index, target);
    return widgetId
        ? index.get(widgetId)?.byPath.get(target.path)?.value
        : undefined;
}

const words = (key: string) =>
    key
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[-_]+/g, " ")
        .toLowerCase();

/** `paragraphs.0.text` → "paragraphs › 1 › text"; a number reads as a position. */
export function humanizePath(path: string) {
    return path
        .split(".")
        .filter((part) => part !== "content")
        .map((part) =>
            /^\d+$/.test(part) ? String(Number(part) + 1) : words(part),
        )
        .join(" › ");
}

export function humanizeWidget(name: string) {
    return words(name.replace(/^anahata/, ""));
}
