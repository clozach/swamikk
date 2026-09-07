/** Evidence of publication by a time, never a fabricated first publication date. */
export interface LessonPublicationObservation {
    publishedBy: Date;
    witness: {
        observedAt: Date;
        groupId: string;
        releaseRevision: number;
        availability: "available" | "scheduled";
        observationId: string;
        actorUserId: string;
    };
}

export type PublicationObservationResult =
    | {
          lessonId: string;
          kind: "recorded" | "already-recorded" | "publication-only";
          publishedBy: string;
          witnessAt: string;
      }
    | {
          lessonId: string;
          kind: "skipped";
          reason:
              | "lesson-unavailable"
              | "lesson-changed"
              | "course-unavailable"
              | "group-unavailable"
              | "first-publication-recorded";
      }
    | {
          lessonId: string;
          kind: "uncertain";
      };

export interface PublicationObservationCandidate {
    lessonId: string;
    title: string;
    groupId: string;
    hasFirstPublicationDate: boolean;
    publishedBy: string | null;
    availabilityWitnessCurrent: boolean;
}
