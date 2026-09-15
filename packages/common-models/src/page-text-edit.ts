/**
 * Inline (WYSIWYG) text editing of static page text by a site manager.
 *
 * A text leaf is one string inside a block's settings — or inside the block's
 * defaults when the setting is absent — addressed by a dot path
 * (`paragraphs.0.text`, `columns.2.addressLines.1`,
 * `text.content.0.content.0.text` for a rich-text node). A rich-text block
 * node (a paragraph or heading inside a TipTap document) is also listed, with
 * its plain-text projection, so a paragraph that mixes formatting can be
 * edited as one run and written back as one node. One edit is a set of
 * changes on one widget, applied together; every edit, undo and restore is an
 * retained history row. Applying rows settle after the atomic source receipt; successful before/after history is immutable.
 */
import type { Media } from "./media";

/** One source for page pictures; URL/placeholder arms are accepted only from retained history when editing live. */
export type ImageSource =
    | { kind: "url"; url: string }
    | { kind: "media"; media: Partial<Media> }
    | { kind: "placeholder"; description: string };
export interface PageImageLeaf {
    path: string;
    label: string;
    value: ImageSource;
}

export type TextLeafKind = "text" | "rich-text-leaf" | "rich-text-node";
export interface TextLeaf {
    path: string;
    /** The string itself, or the plain-text projection of a rich-text node. */
    value: string;
    kind: TextLeafKind;
    /** `default` when the block's defaults supply the value (no stored setting). */
    source: "settings" | "default";
    /** The stored node, present only for `rich-text-node` entries. */
    node?: unknown;
}
export interface PageTextWidgetLeaves {
    widgetId: string;
    name: string;
    shared: boolean;
    leaves: TextLeaf[];
    /** Explicit image registry; never matched by visible text. */
    images?: PageImageLeaf[];
}
export interface PageTextLeaves {
    pageId: string;
    revision: number;
    widgets: PageTextWidgetLeaves[];
}
export type TextEditTarget =
    | { kind: "page-widget-text"; pageId: string; widgetId: string }
    /** Shared header/footer settings live on the site, not the page; pageId records where the edit was made. */
    | { kind: "shared-widget-text"; pageId: string; name: string };
export type TextChange =
    /** One string leaf; `before` is the exact stored value being replaced. */
    | { kind: "text"; path: string; before: string; after: string }
    /** One rich-text block node (paragraph or heading), replaced whole; `before` is the exact stored node. */
    | { kind: "node"; path: string; before: unknown; after: unknown }
    | { kind: "image"; path: string; before: ImageSource; after: ImageSource };
export interface TextEditInput {
    target: TextEditTarget;
    changes: TextChange[];
    /** The edit this one reverses (an undo, a redo, or a restore from History). */
    undoOf?: string;
}
export interface TextEdit {
    editId: string;
    target: TextEditTarget;
    widgetName: string;
    changes: TextChange[];
    userId: string;
    at: string;
    /** The page or site revision the edit produced. */
    revision: number;
    undoOf?: string;
}
export type TextEditResult =
    | { kind: "applied"; edit: TextEdit }
    | {
          kind: "stale";
          /** The stored value (string or node) of every change whose `before` no longer matches. */
          current: Array<{ path: string; value: unknown }>;
          message: string;
      };
export interface TextEditHistory {
    edits: TextEdit[];
    nextCursor: string | null;
}
