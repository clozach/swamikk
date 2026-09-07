import type WidgetInstance from "./widget-instance";
import type { Theme } from "@courselit/page-models";
import type { Typeface } from "./typeface";
export interface PagePublicationTarget {
    kind: "page-publish";
    pageId: string;
    creationChangeId: string;
}
export interface PagePublicationVersion {
    version: number;
    summary: string;
    patch: { kind: "page-publish" };
    baseline: {
        kind: "page-publish";
        documentId: string;
        revision: number;
        fingerprint: string;
        contextFingerprint: string;
    };
    preview: {
        title: string;
        path: string;
        description: string;
        robotsAllowed: boolean;
        layout: WidgetInstance[];
        theme: Theme;
        typefaces: Typeface[];
        globalDrafts: {
            sharedWidgets: boolean;
            theme: boolean;
            typefaces: boolean;
        };
    };
    previewHash: string;
    preparedBy: string;
    preparedAt: string;
}
export interface PagePublicationReceipt {
    outcome: "applied" | "cancelled";
    changeId: string;
    operationId: string;
    version: number;
    previewHash: string;
    revision: number;
    at: string;
}
