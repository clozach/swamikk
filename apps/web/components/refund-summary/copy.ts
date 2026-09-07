export const refundSummaryCopy = {
    title: "Refund history",
    refresh: "Refresh payment status",
    unrecorded: "Refund status has not been recorded here.",
    empty: "No refunds were found when this payment was checked.",
    total: "Successful refunds",
    checked: "Status checked",
    unknownTime: "Check time unavailable",
    separate:
        "The original payment amount stays on record. Content access is shown separately.",
    reviewAmounts:
        "These amounts were recorded for this review. Refund history shows later updates.",
    alreadyAtReview: "Already refunded at review",
    access: {
        pending:
            "This purchase was fully refunded. Its access is unavailable while processing finishes.",
        ended: "This purchase was fully refunded and its access has ended. Other purchases and a later rejoin are unchanged.",
        "ended-booking-review":
            "This purchase’s content access has ended. Class roster needs review; shared roster and tag entries are preserved for any other valid booking.",
        "recovery-required":
            "The refund result changed after this purchase’s access ended. Contact us for an access recovery review; enrollment has not been restored automatically.",
    },
    states: {
        pending: "Pending",
        requires_action: "Action required",
        succeeded: "Succeeded",
        failed: "Failed",
        canceled: "Canceled",
    },
    details: {
        pending: "The refund is still processing.",
        requires_action:
            "The refund needs attention. Ask for help with the payment.",
        succeeded: "The payment provider reports this refund succeeded.",
        failed: "The refund failed; this amount is not included in successful refunds.",
        canceled:
            "The refund was canceled; this amount is not included in successful refunds.",
    },
} as const;
