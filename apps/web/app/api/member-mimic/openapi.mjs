const json = (schema) => ({ content: { "application/json": { schema } } });
const identity = {
    type: "object",
    required: ["userId", "name", "email"],
    properties: {
        userId: { type: "string" },
        name: { type: "string" },
        email: { type: "string", format: "email" },
    },
};
const view = {
    oneOf: [
        {
            type: "object",
            required: ["kind"],
            properties: { kind: { type: "string", enum: ["inactive"] } },
        },
        {
            type: "object",
            required: ["kind", "returnTo"],
            properties: {
                kind: { type: "string", enum: ["expired"] },
                returnTo: { type: "string" },
            },
        },
        {
            type: "object",
            required: ["kind", "actor", "subject", "expiresAt", "returnTo"],
            properties: {
                kind: { type: "string", enum: ["active"] },
                actor: identity,
                subject: identity,
                expiresAt: { type: "string", format: "date-time" },
                returnTo: { type: "string" },
            },
        },
    ],
};
const errors = {
    400: { description: "Invalid or oversized JSON." },
    403: {
        description:
            "Use this site's Origin and an authorized administrator session.",
    },
    404: { description: "Site or member is unavailable." },
    429: { description: "Too many starts; retry after the window." },
    503: { description: "Status is unavailable; no success is assumed." },
};
export const memberMimicApiOpenApi = {
    tags: [
        {
            name: "Member Mimic",
            description:
                "Short-lived, read-only member view with distinct administrator and member identities.",
        },
    ],
    paths: {
        "/api/member-mimic": {
            get: {
                tags: ["Member Mimic"],
                operationId: "getMemberMimic",
                summary: "Verify the current member view",
                description:
                    "Rechecks tenant, actor session, permission, subject and expiry. Invalid markers return expired, never administrator fallback.",
                responses: {
                    200: {
                        description: "Current view; token is never returned.",
                        ...json({
                            type: "object",
                            properties: { mimic: view },
                        }),
                    },
                    ...errors,
                },
            },
            post: {
                tags: ["Member Mimic"],
                operationId: "startMemberMimic",
                summary: "Open the member's normal read-only profile",
                security: [{ CourseLitSession: [] }],
                description:
                    "Requires user:manage and same-origin JSON. Sets an HttpOnly SameSite Strict cookie and revokes the prior view in the same actor session. Authority expires after 15 minutes; the marker remains for explicit Exit. The body is limited to 2 KB; starts to 12/minute.",
                requestBody: {
                    required: true,
                    ...json({
                        type: "object",
                        additionalProperties: false,
                        required: ["userId"],
                        properties: {
                            userId: {
                                type: "string",
                                minLength: 1,
                                maxLength: 128,
                                pattern: "^[a-zA-Z0-9_-]+$",
                            },
                            returnTo: {
                                type: "string",
                                maxLength: 1024,
                                description:
                                    "Only /dashboard/users plus its filter query is accepted.",
                            },
                        },
                    }),
                },
                responses: {
                    201: {
                        description: "View created and cookie set.",
                        ...json({
                            type: "object",
                            properties: {
                                mimic: view,
                                redirectTo: {
                                    type: "string",
                                    enum: ["/dashboard/profile"],
                                },
                            },
                        }),
                    },
                    ...errors,
                },
            },
            delete: {
                tags: ["Member Mimic"],
                operationId: "exitMemberMimic",
                summary: "Revoke and leave the member view",
                description:
                    "Requires this site's Origin and application/json. Clears even an expired or malformed marker; does not require a still-active member-view authority.",
                responses: {
                    200: {
                        description:
                            "Server authority revoked and browser cookie cleared.",
                        ...json({
                            type: "object",
                            properties: { redirectTo: { type: "string" } },
                        }),
                    },
                    ...errors,
                },
            },
        },
    },
};
