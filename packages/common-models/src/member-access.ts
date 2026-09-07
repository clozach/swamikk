export type LessonPublication =
    | { kind: "never" }
    | {
          kind: "known";
          firstPublishedAt: Date;
          source: "native" | "verified-import";
      }
    | { kind: "legacy-unknown" };

export type MembershipAccessStart =
    | { kind: "recorded"; at: Date }
    | { kind: "legacy-unknown" };

export interface MembershipAccessKey {
    domainId: string;
    userId: string;
    courseId: string;
    membershipId: string;
    membershipSessionId: string;
}

export interface MembershipAccessOperation extends MembershipAccessKey {
    operationId: string;
}

export interface PrepareRetentionInput extends MembershipAccessOperation {
    cutoff: Date;
}

export type GroupRelease =
    | { kind: "drip"; groupId: string; at: Date }
    | { kind: "legacy-unknown"; groupId: string };

export interface RetentionSnapshot {
    cutoff: Date;
    visibleLessonIds: string[];
    retainedLessonIds: string[];
    unknownReleaseCount: number;
}

export type MembershipAccessState =
    | { kind: "active" }
    | { kind: "freezing"; operationId: string; cutoff: Date; requestedAt: Date }
    | {
          kind: "prepared";
          operationId: string;
          snapshot: RetentionSnapshot;
          preparedAt: Date;
      }
    | {
          kind: "ended";
          operationId: string;
          snapshot: RetentionSnapshot;
          endedAt: Date;
      };

export type AccessDeliveryState =
    | { kind: "pending" }
    | { kind: "dispatching"; claimedAt: Date; claimId: string }
    | { kind: "sent"; at: Date }
    | { kind: "cancelled"; at: Date }
    | { kind: "uncertain"; at: Date; claimId: string };

/** A delivery intent contains access provenance only; no practice history or email body. */
export interface AccessDeliveryIntent {
    id: string;
    groupId: string;
    createdAt: Date;
    state: AccessDeliveryState;
}

export interface MembershipAccessPeriod extends MembershipAccessKey {
    id: string;
    start: MembershipAccessStart;
    state: MembershipAccessState;
    groupReleases: GroupRelease[];
    lastRelativeReleaseAt?: Date;
    deliveries: AccessDeliveryIntent[];
    revision: number;
    createdAt: Date;
    updatedAt: Date;
    /** Private immutable preimages retained when a verified provider end narrows a boundary. */
    retentionHistory?: Array<{
        state: Extract<MembershipAccessState, { kind: "prepared" | "ended" }>;
        preservedAt: Date;
        reason: "provider-earlier-end" | "verified-preimage-recovery";
        evidenceHash?: string;
        recoveryHash?: string;
    }>;
    reopenedOperations: Array<{
        operationId: string;
        evidenceId: string;
        at: Date;
    }>;
}

export type RetentionResult =
    | { kind: "prepared"; periodId: string; snapshot: RetentionSnapshot }
    | { kind: "ended"; periodId: string; snapshot: RetentionSnapshot };

export interface MembershipAccessSummary {
    periodId: string;
    start: MembershipAccessStart;
    state: MembershipAccessState["kind"];
    cutoff: Date | null;
    retainedCount: number;
    unknownReleaseCount: number;
}

export type LessonAccessDecision =
    | { kind: "allowed"; source: "public" | "active" | "prepared" | "retained" }
    | {
          kind: "denied";
          reason:
              | "unpublished"
              | "membership-required"
              | "membership-ended"
              | "purchase-refunded"
              | "not-released"
              | "access-processing";
      };

export type MemberCourseReadScope =
    | {
          kind: "active";
          courseId: string;
          groupIds: string[];
          retainedLessonIds: string[];
          startedAt?: Date;
          lastRelativeReleaseAt?: Date;
      }
    | {
          kind: "restricted";
          courseId: string;
          lessonIds: string[];
          retainedLessonIds: string[];
          processing: boolean;
          purchaseRefunded?: boolean;
      }
    | { kind: "none"; courseId: string };
