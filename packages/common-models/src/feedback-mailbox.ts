/** Private operational settings. Never include in public site information. */
export type FeedbackMailboxSettings =
    | { kind: "off" }
    | {
          kind: "enabled";
          recipient: string;
          intervalMinutes: number;
          approvedBy: string;
          approvedAt: string;
      };

export type FeedbackNotification =
    | { kind: "pending"; attempts: number; nextAttemptAt: string }
    | {
          kind: "sending";
          attempts: number;
          attemptId: string;
          recipient: string;
          startedAt: string;
          leaseUntil: string;
      }
    | {
          kind: "accepted";
          attempts: number;
          attemptId: string;
          recipient: string;
          acceptedAt: string;
          evidence: "smtp" | "operator";
      }
    | {
          kind: "failed";
          attempts: number;
          reason: "configuration" | "rejected" | "connection";
          nextAttemptAt?: string;
      }
    | {
          kind: "uncertain";
          attempts: number;
          attemptId: string;
          recipient: string;
          startedAt: string;
      };

export type FeedbackMailResult =
    | { kind: "accepted" }
    | {
          kind: "not-accepted";
          reason: "configuration" | "rejected" | "connection";
          retryable: boolean;
      }
    | { kind: "uncertain" };

export interface FeedbackMailboxView {
    settings: FeedbackMailboxSettings;
    ownerEmail: string;
    canConfigure: boolean;
}
