export default {
    "/api/refund-requests": {
        get: {
            summary:
                "Read the member's purchases, receipts and refund requests",
            description:
                "Refund summaries report separately observed money status without altering original paid receipt amounts or access. Read-only tenant/subject projection; Member Mimic cannot see unsubmitted private drafts. No provider calls or access mutations.",
            responses: {
                200: { description: "MemberRefundRequestsView" },
                401: { description: "Sign in required" },
                403: { description: "Mimic expired" },
            },
        },
        post: {
            summary: "Prepare, submit or reconcile an owned refund request",
            description:
                "Same-origin JSON; rejects Member Mimic and browser provider IDs. Prepare preserves a private draft. Submit enters Al's private review queue or a proved class policy path; request, approval and provider result are distinct.",
            responses: {
                200: { description: "RefundRequestView" },
                403: { description: "Origin or Mimic mutation rejected" },
                404: {
                    description:
                        "Receipt/request not owned by this member and tenant",
                },
                409: {
                    description:
                        "Changed review, proof or policy requires review",
                },
            },
        },
    },
    "/api/refund-requests/review": {
        get: {
            summary:
                "Read the private refund review queue or class booking choices",
            description:
                "Actual operator with tenant setting:manage permission only. Optional invoiceId returns real cohort choices for explicit booking verification; roster membership alone never proves payment association.",
            responses: {
                200: {
                    description:
                        "OperatorRefundRequestsView or verified booking choices",
                },
                403: {
                    description: "Operator permission required; Mimic rejected",
                },
            },
        },
        post: {
            summary:
                "Review, approve, decline, escalate, verify a class booking or reconcile",
            description:
                "Same-origin JSON and actual authorized operator. Decisions require the exact current review hash, explanation and complete payment/access evidence. Refund creation has a durable first-attempt claim and never blindly repeats after uncertainty.",
            responses: {
                200: {
                    description:
                        "RefundRequestView or saved booking verification",
                },
                403: { description: "Operator permission or origin rejected" },
                409: {
                    description:
                        "Stale review, unresolved policy or ambiguous evidence",
                },
            },
        },
    },
};
