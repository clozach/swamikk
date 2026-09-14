/**
 * Inline (WYSIWYG) text editing of static page text by a site manager.
 *
 * A text leaf is one string inside a block's settings — or inside the block's
 * defaults when the setting is absent — addressed by a dot path
 * (`paragraphs.0.text`, `columns.2.addressLines.1`,
 * `text.content.0.content.0.text` for a rich-text node). The page shows the
 * leaf's value verbatim, so the page itself is the editor: the run of text is
 * edited in place and saved as one edit. Every edit, undo and restore is an
 * append-only history row; the log is never rewritten.
 */
export type TextLeafKind = "text" | "rich-text-leaf";
export interface TextLeaf {
    path: string;
    value: string;
    kind: TextLeafKind;
    /** `default` when the block's defaults supply the value (no stored setting). */
    source: "settings" | "default";
}
export interface PageTextWidgetLeaves {
    widgetId: string;
    name: string;
    shared: boolean;
    leaves: TextLeaf[];
}
export interface PageTextLeaves {
    pageId: string;
    revision: number;
    widgets: PageTextWidgetLeaves[];
}
export type TextEditTarget =
    | {
          kind: "page-widget-text";
          pageId: string;
          widgetId: string;
          path: string;
      }
    /** Shared header/footer settings live on the site, not the page; pageId records where the edit was made. */
    | {
          kind: "shared-widget-text";
          pageId: string;
          name: string;
          path: string;
      };
export interface TextEditInput {
    target: TextEditTarget;
    /** The exact stored value being replaced; a mismatch is a stale edit. */
    before: string;
    after: string;
    /** The edit this one reverses (an undo, a redo, or a restore from History). */
    undoOf?: string;
}
export interface TextEdit {
    editId: string;
    target: TextEditTarget;
    widgetName: string;
    before: string;
    after: string;
    userId: string;
    at: string;
    /** The page or site revision the edit produced. */
    revision: number;
    undoOf?: string;
}
export type TextEditResult =
    | { kind: "applied"; edit: TextEdit }
    | { kind: "stale"; current: string; message: string };
export interface TextEditHistory {
    edits: TextEdit[];
    nextCursor: string | null;
}
