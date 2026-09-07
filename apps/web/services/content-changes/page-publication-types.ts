import type { ContentChange, Page } from "@courselit/common-models";
import type { InternalContentChange } from "@courselit/orm-models";
export type PagePublicationChange = Extract<
    ContentChange,
    { target: { kind: "page-publish" } }
>;
export type PagePublicationRecord = Extract<
    InternalContentChange,
    { target: { kind: "page-publish" } }
>;
export const isPagePublication = (
    change: ContentChange,
): change is PagePublicationChange => change.target.kind === "page-publish";
export const isPagePublicationRecord = (
    change: InternalContentChange,
): change is PagePublicationRecord => change.target.kind === "page-publish";
export const hasGlobalDrafts = (
    drafts: PagePublicationChange["preview"]["globalDrafts"],
) => Object.values(drafts).some(Boolean);
/** Native server-only guard; never accepted as GraphQL input. */
export interface PagePublicationGuard {
    documentId: string;
    creationChangeId: string;
    revision: number;
    fingerprint: string;
    contextFingerprint: string;
    receipt: NonNullable<Page["publicationReceipt"]>;
}
