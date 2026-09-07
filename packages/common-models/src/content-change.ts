import type {
    PagePublicationTarget,
    PagePublicationVersion,
} from "./page-publication";
import type {
    PageCreationInput,
    PageCreationTarget,
    PageCreationVersion,
} from "./page-creation";
import type { TextEditorContent } from "./text-editor-content";
import type {
    PageWidgetTarget,
    PageWidgetPatch,
    PageWidgetChangeVersion,
    PageWidgetChangeInput,
} from "./page-content-change";
export interface LessonTextPatch {
    title?: string;
    content?: TextEditorContent;
}
export interface LessonChangeTarget {
    kind: "lesson";
    lessonId: string;
}
export interface LessonContentChangeInput {
    feedbackId?: string;
    target: LessonChangeTarget;
    patch: LessonTextPatch;
    summary: string;
}
export type ContentChangeInput =
    | LessonContentChangeInput
    | PageWidgetChangeInput
    | PageCreationInput;
export interface LessonTextSnapshot {
    title: string;
    content: TextEditorContent;
}
export interface ContentChangeBaseline {
    revision: number;
    fingerprint: string;
    snapshot: LessonTextSnapshot;
    courseId: string;
    published: boolean;
}
export interface ContentChangeApproval {
    userId: string;
    at: string;
    version: number;
    previewHash: string;
}
export type ContentChangeState =
    | { kind: "proposed" }
    | { kind: "rejected"; userId: string; at: string }
    | { kind: "stale"; reason: string }
    | { kind: "failed"; reason: string }
    | { kind: "applying"; operationId: string; approval: ContentChangeApproval }
    | {
          kind: "uncertain";
          operationId: string;
          approval: ContentChangeApproval;
          reason: string;
      }
    | {
          kind: "applied";
          operationId: string;
          approval: ContentChangeApproval;
          appliedAt: string;
          appliedRevision: number;
      };
export interface LessonContentChangeVersion {
    version: number;
    summary: string;
    patch: LessonTextPatch;
    baseline: ContentChangeBaseline;
    preview: { before: LessonTextSnapshot; after: LessonTextSnapshot };
    previewHash: string;
    preparedBy: string;
    preparedAt: string;
}
export type ContentChangeVersion =
    | LessonContentChangeVersion
    | PageWidgetChangeVersion
    | PageCreationVersion
    | PagePublicationVersion;
interface ChangeMetadata {
    id: string;
    feedbackId?: string;
    reversesChangeId?: string;
    state: ContentChangeState;
    history: ContentChangeVersion[];
    approvals: ContentChangeApproval[];
    createdAt: string;
    updatedAt: string;
}
export interface LessonContentChange
    extends LessonContentChangeVersion,
        ChangeMetadata {
    target: LessonChangeTarget;
}
export interface PageWidgetContentChange
    extends PageWidgetChangeVersion,
        ChangeMetadata {
    target: PageWidgetTarget;
}
export interface PageCreationChange
    extends PageCreationVersion,
        ChangeMetadata {
    target: PageCreationTarget;
}
export interface PagePublicationChange
    extends PagePublicationVersion,
        ChangeMetadata {
    target: PagePublicationTarget;
}
export type ContentChange =
    | LessonContentChange
    | PageWidgetContentChange
    | PageCreationChange
    | PagePublicationChange;
export const isPageWidgetChange = (
    change: ContentChange,
): change is PageWidgetContentChange => change.target.kind === "page-widget";
export type ContentChangeAction =
    | {
          action: "revise";
          version: number;
          patch: LessonTextPatch | PageWidgetPatch | PageCreationInput["patch"];
          summary: string;
      }
    | { action: "approve"; version: number; previewHash: string }
    | { action: "reject"; version: number }
    | { action: "reconcile" }
    | { action: "revert"; version: number }
    | { action: "prepare-publication"; version: number };
export interface ContentChangeRouteParams {
    params: Promise<{ id: string }>;
}
/** Server-only guard; never accepted directly from the public lesson API. */
export interface LessonWriteGuard {
    revision: number;
    fingerprint: string;
    operationId: string;
}
export interface LessonContentChangeReceipt {
    outcome: "applied" | "cancelled";
    operationId: string;
    revision: number;
    appliedAt: string;
}
export interface ContentChangeApiError {
    error: { code: string; message: string };
}
