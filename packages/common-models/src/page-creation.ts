import type { TextEditorContent } from "./text-editor-content";
import type WidgetInstance from "./widget-instance";
import type { Theme } from "@courselit/page-models";
import type { Typeface } from "./typeface";

export interface PageCreationTarget {
    kind: "page-create";
    pageId: string;
}
export interface PageCreationInput {
    target: PageCreationTarget;
    patch: {
        kind: "page-create";
        title: string;
        content: TextEditorContent;
        intent: string;
        materials: string;
    };
    summary: string;
}
export interface PageCreationVersion {
    version: number;
    summary: string;
    patch: PageCreationInput["patch"];
    baseline: {
        kind: "page-create";
        documentId: string;
        renderFingerprint: string;
        theme: Theme;
        typefaces: Typeface[];
    };
    preview: { title: string; path: string; layout: WidgetInstance[] };
    previewHash: string;
    preparedBy: string;
    preparedAt: string;
}
export interface PageCreationReceipt {
    outcome: "created" | "cancelled";
    changeId: string;
    version: number;
    operationId: string;
    previewHash: string;
    at: string;
}
