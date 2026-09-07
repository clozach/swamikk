export const newsletterUnsubscribeApiOpenApi = {
    tags: [
        {
            name: "Newsletter",
            description:
                "Explicit newsletter opt-out, separate from service and activity notification preferences.",
        },
    ],
    paths: {
        "/api/unsubscribe/{token}": {
            parameters: [
                {
                    name: "token",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                    description:
                        "Opaque per-subscriber unsubscribe token, scoped to the current site.",
                },
            ],
            get: {
                tags: ["Newsletter"],
                operationId: "unsubscribeNewsletterConfirmation",
                summary:
                    "Unsubscribe without login and show a readable confirmation",
                description:
                    "Idempotently turns off newsletter consent only. Repeated and unknown tokens show the same confirmation without revealing account existence. No address/token appears in the HTML body. No-store/no-referrer; no external assets. Receipts, sign-in codes, access mail and enabled service notifications continue. Mimic cannot perform this mutation.",
                responses: {
                    200: {
                        description: "Readable confirmation.",
                        content: {
                            "text/html": { schema: { type: "string" } },
                        },
                    },
                    403: {
                        description:
                            "Read-only Mimic; readable failure confirmation.",
                    },
                    503: {
                        description:
                            "Cannot confirm the result; readable recovery page.",
                    },
                },
            },
            post: {
                tags: ["Newsletter"],
                operationId: "unsubscribeNewsletterOneClick",
                summary: "Idempotent one-click newsletter unsubscribe",
                description:
                    "No login needed. Token and tenant provide the target; request body is ignored. Does not affect service or activity notification choices. Repeated/unknown tokens reveal no account existence. Mimic cannot change consent.",
                responses: {
                    200: {
                        description: "Unsubscribe processed or already absent.",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["message"],
                                    properties: { message: { type: "string" } },
                                },
                            },
                        },
                    },
                    403: { description: "Read-only Mimic." },
                    503: { description: "Unable to confirm; retry/reconcile." },
                },
            },
        },
    },
};
