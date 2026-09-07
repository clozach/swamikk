import type WidgetInstance from "./widget-instance";
import type { TextEditorContent } from "./text-editor-content";
import type { Theme } from "@courselit/page-models";
import type { Typeface } from "./typeface";

export interface PageWidgetTarget {
    kind: "page-widget";
    pageId: string;
    widgetId: string;
    field: string;
}
export type PageWidgetPatch =
    | { kind: "text"; text: string }
    | { kind: "rich-text"; content: TextEditorContent }
    | { kind: "image"; mediaId: string; alt: string }
    /** Only a server-created recovery proposal may contain restored settings. */
    | { kind: "restore-widget"; settings: Record<string, unknown> };
export interface PageWidgetSnapshot {
    kind: "page-widget";
    widget: WidgetInstance;
    fieldValue: unknown;
    renderSettings: Record<string, unknown>;
    defaultDerived: boolean;
    rotatingFallback: boolean;
}
export interface PageWidgetBaseline {
    kind: "page-widget";
    documentId: string;
    revision: number;
    fingerprint: string;
    renderFingerprint: string;
    snapshot: PageWidgetSnapshot;
    pageType: "site" | "product" | "blog" | "community";
    theme: Theme;
    typefaces: Typeface[];
    draft: "absent" | "mirrored-leaf";
    published: true;
}
export interface PageContentChangeReceipt {
    outcome: "applied" | "cancelled";
    operationId: string;
    revision: number;
    appliedAt: string;
}
export interface PageWidgetField {
    field: string;
    kind: "text" | "rich-text" | "image";
    label: string;
    value: unknown;
    defaultDerived: boolean;
}
export interface PageWidgetChangeInput {
    feedbackId?: string;
    target: PageWidgetTarget;
    patch: PageWidgetPatch;
    summary: string;
}
export interface PageWidgetChangeVersion {
    version: number;
    summary: string;
    patch: PageWidgetPatch;
    baseline: PageWidgetBaseline;
    preview: { before: PageWidgetSnapshot; after: PageWidgetSnapshot };
    previewHash: string;
    preparedBy: string;
    preparedAt: string;
}
