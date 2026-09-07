export const billingCopy = {
    profile: "Profile",
    refundLink: "Request a refund",
    amountUnavailable: "Amount unavailable",
    statusUnavailable: "Status unavailable",
    title: "Your membership",
    intro: "Your payments, access and membership, together in one place.",
    profileLink: "Membership and receipts",
    library: "My content",
    receipts: "Your payments",
    empty: "You have no memberships or purchases yet.",
    browse: "Explore the library",
    loading: "Loading your membership…",
    loadFailed:
        "Your membership details could not be loaded. Please try again.",
    retry: "Try again",
    refresh: "Refresh status",
    preparing: "Preparing your review…",
    working: "Checking your request…",
    readOnly:
        "Member Mimic is read-only. Exit Mimic to use an authorized support action.",
    cancel: "Cancel membership and refund this month",
    reviewTitle: "Before you cancel",
    reviewIntro:
        "Review the payment and access changes below. Nothing changes until you confirm.",
    reviewAgain: "Refresh cancellation review",
    confirm: "Confirm cancellation and refund",
    keep: "Keep my membership",
    close: "Close",
    test: "Test payment",
    period: "Current billing month",
    paid: "Paid this month",
    alreadyRefunded: "Already refunded",
    refundedBeforeRequest: "Refunded before this request",
    refund: "Refund remaining this month",
    refundReviewed: "Amount reviewed for refund",
    fullMonth:
        "Your current paid month is refunded in full, including on its last day. An earlier refund is counted so the total does not exceed what you paid.",
    unpaidMonth:
        "There is no paid balance for this month to refund. Cancellation still stops renewal.",
    accessTitle: "What happens to your content",
    retained: "Items released during your membership stay in My content.",
    archive:
        "Archive items released before your membership began become hidden.",
    drops: "New membership drops stop when you cancel. Separately purchased items remain yours.",
    unknown:
        "Some older release dates are unavailable, so those items cannot yet be confirmed as retained.",
    count: (n: number) =>
        `${n} ${n === 1 ? "item" : "items"} currently confirmed as retained`,
    expired:
        "This review has expired. Close it and refresh the cancellation review before confirming.",
    requestFailed:
        "The request could not be confirmed. Refresh its status before trying again. Any request received by the site is retained.",
    humanReview:
        "This payment needs a person to review it. Your membership has not been changed by this review.",
    help: "Ask for help with this payment",
    noReceipts: "No payment is recorded for this membership yet.",
    amount: "Amount",
    date: "Date",
    status: "Status",
    receipt: "Receipt",
    cancelled: "Your membership is cancelled",
    cancellationProcessing: "Your cancellation is being checked",
    cancellationUncertain:
        "We are checking the cancellation result. Please refresh its status before starting another request.",
    cancellationReview:
        "Your request needs a person to finish the review. The status below shows what has already happened.",
    accessCapped:
        "Access is held at the cancellation request while the result is checked. No new drops are being added.",
    accessEnded:
        "Renewal has stopped. Your retained content is available in My content; archive access and future drops have ended.",
    refundNotStarted: "Refund processing has not started.",
    refundProcessing: "Your refund is being checked.",
    refundUncertain:
        "The refund result is not confirmed yet. We will check the existing request before attempting anything again.",
    refundReview: "Your refund needs a person to review it.",
    refundSucceeded:
        "The payment provider has confirmed your refund. Your bank may take time to show it.",
    refundPending: "The payment provider is processing your refund.",
    refundFailed:
        "The refund did not complete. Your membership cancellation remains in place; please ask for help with the refund.",
    refundAction: "The refund needs additional attention. Please ask for help.",
    noRefundUnpaid: "No refund is due because this month was not paid.",
    noRefundAlready: "This month’s paid balance has already been refunded.",
    farewellTitle: "Thank you for practising with us",
    farewell:
        "Thank you for the time you have shared here. You are welcome to return to any practices retained in My content.",
    feedback: "Share a little feedback",
    connect: "Connect with Swami",
    feedbackDescription:
        "An optional note about your experience, shared privately with the team.",
    modeUnknown: "Payment mode not recorded",
};
