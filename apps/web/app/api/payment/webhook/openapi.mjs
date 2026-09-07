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
                    "Stripe requires a configured signing secret and validates the unmodified request body. Completed paid checkouts and paid renewals settle one tenant-scoped invoice per provider object. Old and current Stripe invoice metadata shapes are accepted. Cancellation/refund notifications are not yet handled by this route.",
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
                    400: {
                        description:
                            "Invalid signature, unpaid/unsupported notification, malformed data or unsuccessful reconciliation; no success acknowledged.",
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
                            "Stripe signing secret is missing; no payment data changed.",
                    },
                },
            },
        },
    },
};
