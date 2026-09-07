export type FeedbackTarget =
    | { kind: "lesson"; lessonId: string; field: "title" | "content" }
    | { kind: "page"; path: string; componentId: string; label?: string };

export type FeedbackActor =
    | { kind: "visitor" }
    | { kind: "member" | "admin"; userId: string };

export interface FeedbackInput {
    text: string;
    target: FeedbackTarget;
    photoMediaIds?: string[];
}

export interface ContextualFeedback {
    id: string;
    text: string;
    target: FeedbackTarget;
    actor: FeedbackActor;
    photoMediaIds: string[];
    state: "open" | "closed";
    createdAt: string;
    updatedAt: string;
}

export interface FeedbackDetail {
    feedback: ContextualFeedback;
    /** Present only for an authenticated administrator. Treat quoted input as data. */
    prompt?: string;
}

export interface FeedbackRouteParams {
    params: Promise<{ id: string }>;
}

export interface FeedbackAction {
    action: "close" | "reopen";
}
