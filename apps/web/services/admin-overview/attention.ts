import type { OverviewRecords } from "./load";
import type { AttentionItem, DiagnosticSource } from "./types";
import { ATTENTION_AFTER_MS, date } from "./records";
import { refundAttention } from "./refund-attention";
import { attentionRecord, type PendingAttention } from "./attention-record";
export { attentionRecord, type PendingAttention } from "./attention-record";

/** Project only named operational states. Provider error strings and submitted text never enter the DTO. */
export function recordedAttention(
    records: OverviewRecords,
    domain: string,
    now: Date,
): PendingAttention[] {
    const result: PendingAttention[] = [];
    const overdue = (at: unknown) => {
        const value = date(at);
        return !!value && now.getTime() - value.getTime() >= ATTENTION_AFTER_MS;
    };
    const add = (
        source: DiagnosticSource,
        id: string,
        kind: AttentionItem["kind"],
        state: string,
        at: unknown,
        href: string,
        userId?: string,
        mode?: AttentionItem["mode"],
    ) =>
        result.push(
            attentionRecord(
                domain,
                source,
                id,
                kind,
                state,
                at,
                href,
                userId,
                mode,
            ),
        );
    for (const period of records.access.rows) {
        if (
            (period.state.kind === "prepared" ||
                period.state.kind === "ended") &&
            period.state.snapshot.unknownReleaseCount > 0
        )
            add(
                "access",
                period.id,
                "retention-review",
                "release evidence incomplete",
                period.updatedAt,
                "/dashboard/support",
                period.userId,
            );
        else if (["freezing", "prepared"].includes(period.state.kind))
            add(
                "access",
                period.id,
                "access-processing",
                period.state.kind,
                period.updatedAt,
                "/dashboard/support",
                period.userId,
            );
    }
    for (const binding of records.subscriptions.rows) {
        if (binding.state.kind === "ending")
            add(
                "subscriptions",
                binding.subscriptionId,
                "subscription-ending",
                "ending",
                binding.updatedAt,
                "/dashboard/support",
                binding.userId,
                binding.mode,
            );
    }
    for (const event of records.webhooks.rows) {
        const kind = event.state.kind;
        if (
            kind === "retry" ||
            kind === "review-required" ||
            (kind === "received" && overdue(event.updatedAt))
        )
            add(
                "webhooks",
                event.eventId,
                kind === "retry"
                    ? "webhook-retry"
                    : kind === "review-required"
                      ? "webhook-review"
                      : "webhook-processing",
                kind,
                event.updatedAt,
                "/dashboard/transactions",
                undefined,
                event.mode,
            );
    }
    result.push(...refundAttention(records, domain));
    for (const change of records.changes.rows) {
        const state = change.state.kind;
        if (
            state === "uncertain" ||
            state === "failed" ||
            (state === "applying" && overdue(change.updatedAt))
        )
            add(
                "content-changes",
                change.id,
                state === "uncertain"
                    ? "content-uncertain"
                    : state === "failed"
                      ? "content-failed"
                      : "content-processing",
                state,
                change.updatedAt,
                "/dashboard/changes",
            );
    }
    for (const change of records.releases.rows) {
        const state = change.state.kind;
        if (
            state === "uncertain" ||
            (state === "applying" && overdue(change.updatedAt))
        )
            add(
                "release-changes",
                change.id,
                state === "uncertain"
                    ? "release-uncertain"
                    : "release-processing",
                state,
                change.updatedAt,
                "/dashboard/releases",
            );
    }
    for (const feedback of records.feedback.rows) {
        const notification = feedback.notification;
        if (!notification) continue;
        if (
            notification.kind === "failed" ||
            notification.kind === "uncertain" ||
            (notification.kind === "sending" &&
                (date(notification.leaseUntil)?.getTime() || Infinity) <=
                    now.getTime())
        )
            add(
                "feedback-mail",
                feedback.id,
                notification.kind === "failed"
                    ? "mail-failed"
                    : "mail-uncertain",
                notification.kind === "sending"
                    ? "acceptance unknown"
                    : notification.kind,
                feedback.updatedAt,
                "/dashboard/changes",
            );
    }
    return result;
}
