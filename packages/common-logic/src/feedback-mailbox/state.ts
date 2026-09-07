import type {
    FeedbackMailboxSettings,
    FeedbackMailResult,
    FeedbackNotification,
} from "@courselit/common-models";

export function validMailboxSettings(
    value: unknown,
): value is Extract<FeedbackMailboxSettings, { kind: "enabled" }> {
    const v = value as Extract<
        FeedbackMailboxSettings,
        { kind: "enabled" }
    > | null;
    return (
        !!v &&
        v.kind === "enabled" &&
        typeof v.recipient === "string" &&
        /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(v.recipient) &&
        v.recipient.length <= 254 &&
        Number.isInteger(v.intervalMinutes) &&
        v.intervalMinutes >= 1 &&
        v.intervalMinutes <= 10080 &&
        typeof v.approvedBy === "string" &&
        !!v.approvedBy &&
        Number.isFinite(Date.parse(v.approvedAt))
    );
}

export function initialFeedbackNotification(
    settings: unknown,
    now = new Date(),
): FeedbackNotification {
    const interval =
        (validMailboxSettings(settings) ? settings.intervalMinutes : 1) * 60000;
    return {
        kind: "pending",
        attempts: 0,
        nextAttemptAt: new Date(
            (Math.floor(now.getTime() / interval) + 1) * interval,
        ).toISOString(),
    };
}

export function completedFeedbackNotification(
    claim: Extract<FeedbackNotification, { kind: "sending" }>,
    result: FeedbackMailResult,
    now: Date,
): FeedbackNotification {
    if (result.kind === "accepted")
        return {
            kind: "accepted",
            attempts: claim.attempts,
            attemptId: claim.attemptId,
            recipient: claim.recipient,
            acceptedAt: now.toISOString(),
            evidence: "smtp",
        };
    if (result.kind === "uncertain")
        return {
            kind: "uncertain",
            attempts: claim.attempts,
            attemptId: claim.attemptId,
            recipient: claim.recipient,
            startedAt: claim.startedAt,
        };
    return {
        kind: "failed",
        attempts: claim.attempts,
        reason: result.reason,
        ...(result.retryable && claim.attempts < 5
            ? {
                  nextAttemptAt: new Date(
                      now.getTime() +
                          Math.min(60, 2 ** (claim.attempts - 1)) * 60000,
                  ).toISOString(),
              }
            : {}),
    };
}
