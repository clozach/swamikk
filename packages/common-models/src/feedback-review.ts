import type { TextEditorContent } from "./text-editor-content";
import type {
    LessonChangeTarget,
    ContentChangeVersion,
} from "./content-change";
import type { PageWidgetTarget } from "./page-content-change";

export type FeedbackReviewScope = "public-page-text" | "public-lesson-text";
export interface FeedbackReviewProvenance {
    kind: "feedback-review";
    grantId: string;
    feedbackId: string;
    generation: number;
    inputHash: string;
    resultHash: string;
}
export type FeedbackReviewContext =
    | {
          kind: "escalation-only";
          reason:
              | "private-or-unavailable"
              | "ambiguous-target"
              | "unsupported-target"
              | "scope-excluded";
      }
    | {
          kind: "text";
          target: LessonChangeTarget | PageWidgetTarget;
          field: string;
          valueKind: "text" | "rich-text";
          value: string | TextEditorContent;
          sourceHash: string;
      };
export type FeedbackReviewResult =
    | {
          kind: "escalation";
          reason:
              | "human-review"
              | "private-or-access"
              | "payment-or-policy"
              | "structure-or-media"
              | "ambiguous-target";
          summary: string;
      }
    | {
          kind: "text-proposal";
          summary: string;
          replacement:
              | { kind: "text"; text: string }
              | { kind: "rich-text"; content: TextEditorContent };
      };
export interface FeedbackReviewLease {
    lastFailure?: { code: string; at: string };
    generation: number;
    grantId: string;
    leaseId: string;
    leaseUntil: string;
    inputHash: string;
    context: FeedbackReviewContext;
}
export interface FeedbackReviewIntent {
    id: string;
    resultHash: string;
    result: FeedbackReviewResult;
    acceptedAt: string;
    proposal?: {
        id: string;
        target: LessonChangeTarget | PageWidgetTarget;
        version: ContentChangeVersion;
        provenance: FeedbackReviewProvenance;
    };
}
export type FeedbackReviewState =
    | (FeedbackReviewLease & { kind: "leased" })
    | (FeedbackReviewLease & {
          kind: "submitting";
          intent: FeedbackReviewIntent;
      })
    | (FeedbackReviewLease & {
          kind: "done";
          intent: FeedbackReviewIntent;
          completedAt: string;
      });
/** Sanitized operational view, administrators only; never the saved input/result intent. */
export interface FeedbackReviewStatus {
    generation: number;
    kind: FeedbackReviewState["kind"];
    grantId: string;
    outcome?: "text-proposal" | "escalation";
    summary?: string;
    proposalId?: string;
    lastFailure?: { code: string; at: string };
}
