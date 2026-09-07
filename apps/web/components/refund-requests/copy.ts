import type { RefundRequestView } from "@/services/refund-requests/types";

export const refundCopy = {
    title: "Purchase and class refunds",
    intro: "Review a paid receipt and share the reason for your request. Purchases are reviewed by Al, with KK available when needed.",
    classes:
        "Class requests made at least 14 days before the verified start qualify for a full refund of the remaining payment. Requests closer to the start need a review.",
    monthly: "Membership and receipts",
    receipt: "View receipt",
    loading: "Loading your payments…",
    failed: "These payments could not be loaded. Your saved requests remain available when the connection returns.",
    actionFailed:
        "The request could not be completed. Refresh its status before trying again. Your typed text is still here.",
    refresh: "Refresh status",
    prepare: "Review request",
    submit: "Submit refund request",
    reason: "What would you like us to know?",
    privateDraft: "This draft is private until you submit it.",
    readOnly:
        "Member Mimic shows submitted requests and receipts. Exit Member Mimic to make changes.",
    empty: "No paid receipts are available yet.",
    reviewTitle: "Refund review",
    reviewIntro:
        "Review the verified payment, class booking and access consequence before approving the exact amount shown.",
    queue: "Submitted requests are saved in this private queue. Email delivery is not configured; check this page for updates.",
    emptyQueue: "No submitted refund requests are waiting here.",
    explanation: "Reason for this decision",
    approve: "Approve the reviewed refund",
    decline: "Decline request",
    escalate: "Ask KK to review",
    paymentReview: "Refresh payment review",
    quoteUnavailable:
        "The original payment could not be verified automatically. A reviewer must resolve its payment evidence before a refund can be applied.",
    pendingPolicy:
        "The access consequence needs a policy decision before a refund can be applied. The request can still be submitted for review.",
    expired:
        "This payment review has expired. Refresh it before approving a refund.",
    noChange: "Your monthly membership and other purchases are unchanged.",
    booking: "Verify a class booking",
    bookingHelp:
        "Check the original receipt against the actual booking. A place on a class roster alone does not prove that this receipt paid for it.",
    bookingConfirm:
        "I checked that this receipt paid for the selected class booking.",
    bookingEvidence: "How was the receipt matched to this booking?",
    bookingSave: "Save verified booking",
    noClasses:
        "No dated class booking is available to verify. Resolve the booking record before approving a class refund.",
} as const;

export function requestStatus(state: RefundRequestView["state"]) {
    return {
        draft: "Private draft",
        submitted: "Waiting for review",
        approved: "Approved",
        declined: "Request declined",
        processing: "Checking refund",
        complete: "Refund complete",
        "review-required": "Review needed",
    }[state];
}
export function refundStatus(refund: RefundRequestView["refund"]) {
    if (refund.kind === "refund")
        return {
            pending: "The refund is pending with the payment provider.",
            succeeded:
                "The payment provider confirmed the refund. Your bank may take time to show it.",
            failed: "The refund failed. The money has not been confirmed returned; a reviewer needs to help.",
            canceled:
                "The refund was canceled by the payment provider. The money has not been confirmed returned.",
            requires_action:
                "The payment provider needs further action before the refund can finish.",
        }[refund.status];
    return {
        "not-started": "No refund has been sent.",
        uncertain:
            "The refund result is not yet known. Check the existing request; do not submit another one.",
        processing: "The existing refund is being checked.",
        "already-refunded": "The full payment was already refunded.",
        "review-required":
            "The payment needs a reviewer before the refund can proceed.",
    }[refund.kind];
}
export function classTime(value: string) {
    return (
        new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "UTC",
        }).format(new Date(value)) + " UTC"
    );
}
