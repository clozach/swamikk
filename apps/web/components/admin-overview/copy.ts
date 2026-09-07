import type {
    AttentionItem,
    DiagnosticSource,
} from "@/services/admin-overview/types";

export const overviewCopy = {
    title: "Membership overview",
    supportTitle: "Support & diagnostics",
    permission:
        "Site settings permission is required for site-wide payments and diagnostics. Your other administration pages remain available in the menu.",
    loading: "Reading the latest records…",
    failed: "The snapshot could not be read. No health result is available. Try refreshing; if this continues, contact Al.",
    refresh: "Refresh snapshot",
    noIssues: "No items to review in the records checked.",
    missing: "Unavailable",
    coverage:
        "These are existing operational records, not a complete event timeline. A recent snapshot confirms this read, not that a worker is running. Missing or quiet sources do not prove the service is healthy.",
    uncollected:
        "Joining funnels, OTP delivery and verification, practice playback and retention cohorts are not measured here. Provider acceptance does not prove inbox delivery. Browser and queue traces, worker heartbeats, dropped-signal counts and source-map diagnostics are not available in this view.",
    money: "Confirmed paid receipts in this period, grouped by recorded payment mode and currency. Test money is separate. Refunds are the latest recorded observations for those receipts, regardless of refund date. Original paid amounts stay unchanged. Fees are not recorded here; these totals are not net revenue.",
    limits: "Record selections use at most the latest 500 matching records per source; each source below states whether it was limited. Limited results are not site-wide totals. Published products is a separate full count.",
    membership:
        "Course membership records, including included products; these are not unique people. A record marked active is not proof of current access. Access records count membership periods, including earlier periods retained after cancellation.",
    recovery:
        "First response: Al. Open the relevant record, then inspect the member through Member Mimic when available. Reconcile an uncertain payment, message or approved change through its existing workflow before retrying. This view never grants access, issues refunds, resends mail or reapplies content. Sent messages cannot be recalled.",
    report: "When reporting a problem, include this snapshot ID, the item's diagnostic ID, the page, device/browser, what you clicked and what you saw. These IDs identify this read and its records; they are not end-to-end request traces. Do not paste sign-in codes, payment details or message content.",
};
export const sourceLabels: Record<DiagnosticSource, string> = {
    payments: "Paid receipts in period / recently created undated receipts",
    memberships: "Course memberships",
    access: "Access periods",
    subscriptions: "Subscription reconciliation",
    refunds: "Refund observations",
    cancellations: "Cancellation operations",
    "refund-requests": "Refund requests",
    webhooks: "Unresolved payment webhooks",
    "content-changes": "Unsettled or failed content changes",
    "release-changes": "Unsettled release changes",
    "feedback-mail": "Unsettled or failed feedback mail",
    products: "Published products",
};
export const attentionLabels: Record<AttentionItem["kind"], [string, string]> =
    {
        "paid-access-review": [
            "Payment received; access needs checking",
            "More than 60 seconds after confirmed settlement, the current session has no active access in the server check. This needs review; it does not prove a failed payment or authorize a new grant.",
        ],
        "access-processing": [
            "Membership access is processing",
            "A recorded cancellation boundary is being prepared or finalized. Future access may be capped while it is reconciled.",
        ],
        "retention-review": [
            "Retained content needs a release-evidence review",
            "The saved cancellation snapshot contains lessons with unknown release timing. Inspect the evidence with Al; this does not authorize a new grant or a recalculation from today's content.",
        ],
        "subscription-ending": [
            "Subscription ending needs reconciliation",
            "The provider end is recorded; finishing retained access is still in progress.",
        ],
        "webhook-retry": [
            "Payment event needs another check",
            "A signed event remains retryable. Inspect the transaction and ask Al to reconcile if provider retries do not resolve it.",
        ],
        "webhook-review": [
            "Payment event needs review",
            "A signed event could not be safely applied. Al must inspect its verified provider and native records.",
        ],
        "webhook-processing": [
            "Payment event is still processing",
            "The received event has no completed result after 60 seconds. Refresh before attempting recovery.",
        ],
        "refund-review": [
            "Refund needs review",
            "Review the exact money status and the existing request. A refund alone does not change membership access.",
        ],
        "cancellation-review": [
            "Cancellation needs review",
            "Inspect the member's membership and last recorded cancellation result before retrying.",
        ],
        "refund-processing": [
            "Refund or cancellation is processing",
            "An operation is pending or its result is not yet certain. Check its current status before making another request.",
        ],
        "content-uncertain": [
            "Content change outcome is uncertain",
            "Use the existing change's status check before applying anything again.",
        ],
        "content-failed": [
            "Content change did not complete",
            "Open the change to inspect its recorded result and prepare a new review if needed.",
        ],
        "content-processing": [
            "Content change is still processing",
            "The approved change has no settled result after 60 seconds. Check its status before retrying.",
        ],
        "release-uncertain": [
            "Release change outcome is uncertain",
            "Open release scheduling and check the existing change's result.",
        ],
        "release-processing": [
            "Release change is still processing",
            "The approved schedule change has no settled result after 60 seconds.",
        ],
        "mail-failed": [
            "Feedback notification was not accepted",
            "Inspect feedback mailbox delivery status and its recorded retry or review action.",
        ],
        "mail-uncertain": [
            "Feedback notification acceptance is uncertain",
            "Check the mailbox operation before resending. An uncertain send may already have been accepted.",
        ],
    };
