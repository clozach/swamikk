const json = (schema) => ({ content: { "application/json": { schema } } });
const session = [{ CourseLitSession: [] }];
const errors = {
    400: { description: "Invalid settings or reconciliation input." },
    403: {
        description:
            "Administrator/settings permission or same-origin check failed.",
    },
    404: { description: "Site or feedback does not belong to this tenant." },
    409: {
        description:
            "Stale status, uncertain result without verification, or unsafe retry.",
    },
    429: { description: "Rate limit exceeded." },
    503: {
        description:
            "Unavailable; refresh status before retrying. Saved feedback is retained.",
    },
};
export default {
    tags: [
        {
            name: "Feedback Mailbox",
            description:
                "Private operational notification configuration and reconciliation. No site change or AI execution.",
        },
    ],
    paths: {
        "/api/feedback-mailbox": {
            get: {
                tags: ["Feedback Mailbox"],
                operationId: "getFeedbackMailbox",
                security: session,
                summary:
                    "Read private delivery status as a feedback administrator",
                responses: {
                    200: {
                        description:
                            "Private settings, existing owner email and canConfigure flag. Delivery is off when not configured.",
                    },
                    ...errors,
                },
            },
            post: {
                tags: ["Feedback Mailbox"],
                operationId: "saveFeedbackMailbox",
                security: session,
                summary:
                    "Configure the approved private recipient and notification interval",
                description:
                    "Requires manageSettings and feedback administrator permission, same-origin Origin and application/json. Enabling explicitly approves the recipient for private excerpts. Does not send synchronously, buy a provider, or activate AI review.",
                requestBody: {
                    required: true,
                    ...json({
                        oneOf: [
                            {
                                type: "object",
                                additionalProperties: false,
                                required: ["kind"],
                                properties: {
                                    kind: { type: "string", enum: ["off"] },
                                },
                            },
                            {
                                type: "object",
                                additionalProperties: false,
                                required: [
                                    "kind",
                                    "recipient",
                                    "intervalMinutes",
                                    "approvedPrivateRecipient",
                                ],
                                properties: {
                                    kind: { type: "string", enum: ["enabled"] },
                                    recipient: {
                                        type: "string",
                                        format: "email",
                                        maxLength: 254,
                                    },
                                    intervalMinutes: {
                                        type: "integer",
                                        minimum: 1,
                                        maximum: 10080,
                                    },
                                    approvedPrivateRecipient: {
                                        type: "boolean",
                                        enum: [true],
                                    },
                                },
                            },
                        ],
                    }),
                },
                responses: {
                    200: {
                        description:
                            "Settings saved in the existing domain settings; operator identity and approval time recorded.",
                    },
                    ...errors,
                },
            },
        },
        "/api/feedback-mailbox/{id}": {
            parameters: [
                {
                    name: "id",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                },
            ],
            post: {
                tags: ["Feedback Mailbox"],
                operationId: "reconcileFeedbackNotification",
                security: session,
                summary:
                    "Retry a definite failure or reconcile an uncertain notification",
                description:
                    "Feedback administrator, same-origin session only. Retry cannot resend accepted/in-flight/uncertain notifications. Uncertain outcomes require explicit verification after checking the mailbox/provider log. Closed feedback cannot be queued. Status compare-and-set rejects stale updates.",
                requestBody: {
                    required: true,
                    ...json({
                        type: "object",
                        additionalProperties: false,
                        required: ["action", "expectedUpdatedAt"],
                        properties: {
                            action: {
                                type: "string",
                                enum: [
                                    "retry",
                                    "confirm-received",
                                    "confirm-not-sent",
                                ],
                            },
                            expectedUpdatedAt: {
                                type: "string",
                                format: "date-time",
                            },
                            verified: {
                                type: "boolean",
                                description:
                                    "Must be true for either uncertain-outcome confirmation.",
                            },
                        },
                    }),
                },
                responses: {
                    200: {
                        description:
                            "Feedback returned with administrator-only notification state: pending, sending, accepted, failed or uncertain. Accepted means SMTP acceptance or an explicit operator confirmation, not inbox/read proof.",
                    },
                    ...errors,
                },
            },
        },
    },
};
