export const paymentWebhookOpenApi = {
    tags: [
        {
            name: "Payment callbacks",
            description: "Payment-provider callbacks, not browser actions.",
        },
    ],
    paths: {
        "/api/payment/webhook": {
            post: {
                tags: ["Payment callbacks"],
                summary: "Reconcile a signed payment notification",
                description:
                    "Stripe verifies the unchanged UTF-8 body (maximum 1 MiB) with the tenant signing secret. Paid checkout/renewal and subscription.updated/deleted callbacks reconcile exact tenant, mode, provider and membership-session bindings. Actual subscription ending caps and freezes retained access; scheduled cancellation and attention states do not imply ending. Completed event IDs deduplicate; unsupported signed events are ignored. Refund.created/updated/failed and charge.refunded callbacks record current refund status through an exact charge-to-native-invoice proof, without changing paid settlement, approving requests or changing access.",
                security: [],
                parameters: [
                    {
                        in: "header",
                        name: "Stripe-Signature",
                        required: false,
                        schema: { type: "string" },
                        description:
                            "Required when Stripe is the configured provider.",
                    },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                additionalProperties: true,
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description:
                            "Payment recorded and membership reconciled, or recorded without activating an inactive subscription.",
                    },
                    202: {
                        description:
                            "Verified event retained for review because correlation or account state is unavailable; no guessed access activation.",
                    },
                    400: {
                        description:
                            "Invalid signature, mode mismatch, malformed or oversized body.",
                    },
                    404: {
                        description: "Tenant or matching membership not found.",
                    },
                    409: {
                        description:
                            "Notification belongs to a different subscription.",
                    },
                    503: {
                        description:
                            "Signing configuration unavailable or reconciliation is retryable/in progress. Replay the signed event; do not create another payment.",
                    },
                },
            },
        },
    },
};
