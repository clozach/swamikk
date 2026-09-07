export type DiagnosticSource =
    | "payments"
    | "memberships"
    | "access"
    | "subscriptions"
    | "refunds"
    | "cancellations"
    | "refund-requests"
    | "webhooks"
    | "content-changes"
    | "release-changes"
    | "feedback-mail"
    | "products";

export interface SourceCoverage {
    source: DiagnosticSource;
    state: "available" | "unavailable";
    loaded: number;
    limited: boolean;
    latestRecordAt: string | null;
}

/** Read projection only. Amounts use major currency units; no provider/customer IDs or message bodies. */
export interface PaymentOverview {
    mode: "test" | "live" | "unknown";
    currency: string;
    receipts: number;
    paid: number;
    observedRefunds: number;
    refundEvidenceCount: number;
    refundsCheckedAt: string | null;
}

export interface AttentionItem {
    diagnosticId: string;
    source: DiagnosticSource;
    kind:
        | "paid-access-review"
        | "access-processing"
        | "retention-review"
        | "subscription-ending"
        | "webhook-retry"
        | "webhook-review"
        | "webhook-processing"
        | "refund-review"
        | "cancellation-review"
        | "refund-processing"
        | "content-uncertain"
        | "content-failed"
        | "content-processing"
        | "release-uncertain"
        | "release-processing"
        | "mail-failed"
        | "mail-uncertain";
    state: string;
    recordedAt: string | null;
    mode?: "test" | "live" | "unknown";
    member?: { label: string; userId?: string };
    href: string;
}

export interface AdminOverview {
    snapshotId: string;
    generatedAt: string;
    periodStart: string;
    days: 7 | 30;
    payments: PaymentOverview[];
    undatedPaidReceipts: number;
    membershipRecords: {
        active: number;
        pending: number;
        other: number;
    } | null;
    accessRecords: { active: number; processing: number; ended: number } | null;
    publishedProducts: number | null;
    attention: AttentionItem[];
    attentionTotal: number;
    attentionLimited: boolean;
    paidAccessChecks: {
        checked: number;
        limited: boolean;
        unavailable: boolean;
    };
    sources: SourceCoverage[];
}
