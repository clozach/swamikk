import type {
    PageTextLeaves,
    PageImageLeaf,
    TextChange,
    TextEditTarget,
    TextLeaf,
} from "@courselit/common-models";

/** Whitespace as the browser shows it: one space between words, none at the ends. */
export const normalizeText = (text: string) =>
    text.replace(/ /g, " ").replace(/\s+/g, " ").trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/** The words a rich-text node shows: text nodes in order, a line break per hardBreak. */
export function nodePlain(node: unknown): string {
    if (!isRecord(node)) return "";
    if (node.type === "text")
        return typeof node.text === "string" ? node.text : "";
    if (node.type === "hardBreak") return "\n";
    return Array.isArray(node.content)
        ? node.content.map(nodePlain).join("")
        : "";
}

/** The text-node leaves inside a rich-text node, with the paths the server would list. */
export function nodeTextLeaves(
    node: unknown,
    base: string,
    source: TextLeaf["source"],
): TextLeaf[] {
    if (!isRecord(node)) return [];
    if (node.type === "text")
        return typeof node.text === "string" && node.text.trim()
            ? [
                  {
                      path: `${base}.text`,
                      value: node.text,
                      kind: "rich-text-leaf",
                      source,
                  },
              ]
            : [];
    return Array.isArray(node.content)
        ? node.content.flatMap((child, index) =>
              nodeTextLeaves(child, `${base}.content.${index}`, source),
          )
        : [];
}

export interface WidgetLeafIndex {
    widgetId: string;
    name: string;
    shared: boolean;
    byPath: Map<string, TextLeaf>;
    images: Map<string, PageImageLeaf>;
    /** normalized string value → every leaf path that reads that way (more than one = ambiguous). */
    byValue: Map<string, string[]>;
    /** normalized plain text of a rich-text node → every node path that reads that way. */
    byNodeValue: Map<string, string[]>;
}
export type LeafIndex = Map<string, WidgetLeafIndex>;

const add = (map: Map<string, string[]>, key: string, path: string) =>
    map.set(key, [...(map.get(key) || []), path]);
const remove = (map: Map<string, string[]>, key: string, path: string) => {
    const remaining = (map.get(key) || []).filter((item) => item !== path);
    if (remaining.length) map.set(key, remaining);
    else map.delete(key);
};
const valueMap = (widget: WidgetLeafIndex, leaf: TextLeaf) =>
    leaf.kind === "rich-text-node" ? widget.byNodeValue : widget.byValue;

function addLeaf(widget: WidgetLeafIndex, leaf: TextLeaf) {
    // A copy: saves update the index in place and must never touch the payload.
    const copy = { ...leaf };
    widget.byPath.set(copy.path, copy);
    add(valueMap(widget, copy), normalizeText(copy.value), copy.path);
}
function dropLeaf(widget: WidgetLeafIndex, path: string) {
    const leaf = widget.byPath.get(path);
    if (!leaf) return;
    remove(valueMap(widget, leaf), normalizeText(leaf.value), path);
    widget.byPath.delete(path);
}

export function indexLeaves(page: PageTextLeaves): LeafIndex {
    const index: LeafIndex = new Map();
    for (const widget of page.widgets) {
        const entry: WidgetLeafIndex = {
            widgetId: widget.widgetId,
            name: widget.name,
            shared: widget.shared,
            byPath: new Map(),
            images: new Map(
                (widget.images || []).map((image) => [
                    image.path,
                    { ...image },
                ]),
            ),
            byValue: new Map(),
            byNodeValue: new Map(),
        };
        for (const leaf of widget.leaves) addLeaf(entry, leaf);
        index.set(widget.widgetId, entry);
    }
    return index;
}

/** Record saved changes so later matches and edits start from them. */
export function applyChangesToIndex(
    index: LeafIndex,
    widgetId: string,
    changes: TextChange[],
) {
    const widget = index.get(widgetId);
    if (!widget) return;
    for (const change of changes) {
        if (change.kind === "image") {
            const image = widget.images.get(change.path);
            if (image)
                widget.images.set(change.path, {
                    ...image,
                    value: change.after,
                });
            continue;
        }
        const leaf = widget.byPath.get(change.path);
        if (!leaf) continue;
        if (change.kind === "text") {
            dropLeaf(widget, change.path);
            addLeaf(widget, {
                ...leaf,
                value: change.after,
                source: "settings",
            });
            continue;
        }
        // A node moved: its own entry, then every text leaf beneath it.
        for (const path of Array.from(widget.byPath.keys()))
            if (path.startsWith(`${change.path}.`)) dropLeaf(widget, path);
        dropLeaf(widget, change.path);
        addLeaf(widget, {
            ...leaf,
            value: nodePlain(change.after),
            node: change.after,
            source: "settings",
        });
        for (const inner of nodeTextLeaves(
            change.after,
            change.path,
            "settings",
        ))
            addLeaf(widget, inner);
    }
}

/** The widget id a target's text lives under on this page (shared blocks are keyed by name on the page). */
export function targetWidgetId(index: LeafIndex, target: TextEditTarget) {
    if (target.kind === "page-widget-text") return target.widgetId;
    for (const widget of Array.from(index.values()))
        if (widget.shared && widget.name === target.name)
            return widget.widgetId;
    return undefined;
}

/** What the page stores at a path now: a string, or a rich-text node. */
export function currentAt(
    index: LeafIndex,
    target: TextEditTarget,
    path: string,
): unknown {
    const widgetId = targetWidgetId(index, target);
    const leaf = widgetId ? index.get(widgetId)?.byPath.get(path) : undefined;
    if (!leaf)
        return widgetId
            ? index.get(widgetId)?.images.get(path)?.value
            : undefined;
    return leaf.kind === "rich-text-node" ? leaf.node : leaf.value;
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
