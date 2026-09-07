const json = (schema) => ({ content: { "application/json": { schema } } });
const errors = {
    400: { description: "Invalid confirmation." },
    401: { description: "Persisted account session required." },
    403: {
        description:
            "Recent real sign-in and same-origin request required; Mimic cannot close accounts.",
    },
    409: {
        description:
            "A financial action, changed review, or durable in-flight write requires attention. Erasure has not been declared complete.",
    },
    429: { description: "Too many requests." },
    503: {
        description: "Check the account's state with support before retrying.",
    },
};
export const accountClosureApiOpenApi = {
    tags: [
        {
            name: "Account closure",
            description:
                "Own-account consequence review and fenced erasure, with financial/recovery references retained.",
        },
    ],
    paths: {
        "/api/account-closure": {
            get: {
                tags: ["Account closure"],
                operationId: "reviewAccountClosure",
                security: [{ CourseLitSession: [] }],
                summary: "Review own account closure",
                description:
                    "No-store. Reads a persisted Better Auth session with cookie cache bypassed. Reports recent identity, blockers, review hash and pending write count. No provider action or erasure.",
                responses: {
                    200: {
                        description: "Current consequence review.",
                        ...json({
                            type: "object",
                            required: [
                                "kind",
                                "blockers",
                                "reviewHash",
                                "state",
                                "pendingWrites",
                                "recentIdentity",
                            ],
                            properties: {
                                kind: { type: "string", enum: ["review"] },
                                blockers: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        required: ["kind", "message", "href"],
                                        properties: {
                                            kind: {
                                                type: "string",
                                                enum: [
                                                    "membership",
                                                    "financial",
                                                    "owner",
                                                    "checkout",
                                                ],
                                            },
                                            message: { type: "string" },
                                            href: { type: "string" },
                                        },
                                    },
                                },
                                reviewHash: {
                                    type: "string",
                                    pattern: "^[a-f0-9]{64}$",
                                },
                                state: {
                                    type: "string",
                                    enum: [
                                        "active",
                                        "closing",
                                        "erasing",
                                        "erased",
                                    ],
                                },
                                pendingWrites: { type: "integer", minimum: 0 },
                                recentIdentity: { type: "boolean" },
                            },
                        }),
                    },
                    ...errors,
                },
            },
            delete: {
                tags: ["Account closure"],
                operationId: "closeOwnAccount",
                security: [{ CourseLitSession: [] }],
                summary: "Confirm own account closure",
                description:
                    "Requires the matching server review and a persisted sign-in created in the last ten minutes. No provider cancellation/refund is invoked. Pending checkout/subscription/financial actions and in-flight writes stop erasure. Receipts, submitted financial audit, unresolved operation locks and minimal erased-account fences remain. Backups and already-delivered email are not erased.",
                requestBody: {
                    required: true,
                    ...json({
                        type: "object",
                        additionalProperties: false,
                        required: ["reviewHash", "confirmation"],
                        properties: {
                            reviewHash: {
                                type: "string",
                                pattern: "^[a-f0-9]{64}$",
                            },
                            confirmation: { type: "string", enum: ["CLOSE"] },
                        },
                    }),
                },
                responses: {
                    200: {
                        description:
                            "Account and private records erased; linked authentication accounts/sessions removed.",
                        ...json({
                            type: "object",
                            properties: {
                                kind: { type: "string", enum: ["closed"] },
                            },
                        }),
                    },
                    ...errors,
                },
            },
            patch: {
                tags: ["Account closure"],
                operationId: "keepOwnAccount",
                security: [{ CourseLitSession: [] }],
                summary: "Keep an account before erasure starts",
                description:
                    "Reopens only the closing state. Cannot undo erasing/erased states or clear unresolved write reservations.",
                requestBody: {
                    required: true,
                    ...json({
                        type: "object",
                        additionalProperties: false,
                        required: ["action"],
                        properties: {
                            action: { type: "string", enum: ["keep"] },
                        },
                    }),
                },
                responses: {
                    200: { description: "Account remains open." },
                    ...errors,
                },
            },
        },
    },
};
