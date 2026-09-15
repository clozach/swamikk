import type WidgetInstance from "./widget-instance";

export interface SectionEditTarget {
    pageId: string;
    /** Immutable native document identity: a replacement at the same route is different. */
    documentId: string;
    widgetId: string;
}
export interface SectionPosition {
    beforeId: string | null;
    afterId: string | null;
    index: number;
}
export interface SectionEdit {
    editId: string;
    target: SectionEditTarget;
    action: "remove" | "restore";
    widgetName: string;
    label: string;
    widget: WidgetInstance;
    position: SectionPosition;
    userId: string;
    at: string;
    revision: number;
    undoOf?: string;
}
export type SectionEditInput =
    | {
          action: "remove";
          requestId: string;
          target: SectionEditTarget;
          fingerprint: string;
      }
    | { action: "reverse"; requestId: string; editId: string };
export interface RemovableSection {
    widgetId: string;
    widgetName: string;
    label: string;
    fingerprint: string;
    index: number;
}
export interface PageSections {
    pageId: string;
    documentId: string;
    revision: number;
    sections: RemovableSection[];
    /** Latest removal for each currently absent section, including after reload. */
    removed: SectionEdit[];
}
export interface SectionEditHistory {
    edits: SectionEdit[];
    nextCursor: string | null;
}
export interface SectionEditResult {
    kind: "applied";
    edit: SectionEdit;
}
export interface SectionLayoutSnapshot {
    widget: WidgetInstance;
    /** All sibling IDs in their original order; restoration uses the nearest surviving anchors. */
    order: string[];
}
export interface SectionSnapshot {
    published: SectionLayoutSnapshot;
    draft: { kind: "absent" } | ({ kind: "mirrored" } & SectionLayoutSnapshot);
}
export type SectionEditState =
    | { kind: "applying" }
    | { kind: "applied" }
    | { kind: "failed"; code: string; message: string };
