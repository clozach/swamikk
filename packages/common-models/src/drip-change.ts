export type ReleaseRule =
    | { kind: "available" }
    | { kind: "exact"; at: string }
    | { kind: "relative"; delayInMillis: number }
    | { kind: "unknown" };

export interface DripChangePatch {
    groupId: string;
    rule: Exclude<ReleaseRule, { kind: "unknown" }>;
    groupOrder: string[];
    notificationEnabled: boolean;
}

export interface DripSectionView {
    id: string;
    name: string;
    rule: ReleaseRule;
    publishedLessons: number;
    draftLessons: number;
    unknownPublicationDates: number;
    notification: { enabled: boolean; subject: string; html: string } | null;
}

export interface DripImpact {
    activeMembers: number;
    processingMembers: number;
    endedPeriods: number;
    alreadyReleased: number;
    newlyAvailableNow: number;
    notificationRecipientsNow: number;
    notificationSectionIds: string[];
    unknownAnchors: number;
    pendingMessages: number;
    dispatchingMessages: number;
    sentMessages: number;
    uncertainMessages: number;
    samples: Array<{
        label: string;
        before: string | null;
        after: string | null;
    }>;
}

export interface DripPreview {
    before: DripSectionView[];
    after: DripSectionView[];
    impact: DripImpact;
    coursePublished: boolean;
    evaluatedAt: string;
    expiresAt: string;
    effectsHash: string;
}

export type DripChangeState =
    | { kind: "draft" }
    | { kind: "stale"; reason: string }
    | { kind: "applying"; operationId: string; approvedBy: string; at: string }
    | { kind: "uncertain"; operationId: string; approvedBy: string; at: string }
    | { kind: "applied"; operationId: string; approvedBy: string; at: string }
    | { kind: "not-applied"; reason: string }
    | { kind: "discarded"; at: string };

export interface DripChangeVersion {
    version: number;
    patch: DripChangePatch;
    preview: DripPreview;
    previewHash: string;
    preparedBy: string;
    preparedAt: string;
}

export interface DripChange extends DripChangeVersion {
    id: string;
    courseId: string;
    state: DripChangeState;
    history: DripChangeVersion[];
    restoresChangeId?: string;
    createdAt: string;
    updatedAt: string;
}

export interface DripCourseView {
    courseId: string;
    title: string;
    published: boolean;
    sections: DripSectionView[];
    availabilityChangesRestricted: boolean;
    changes: DripChange[];
}

export interface DripChangeReceipt {
    changeId: string;
    version: number;
    operationId: string;
    outcome: "applied" | "cancelled";
    at: Date;
}
