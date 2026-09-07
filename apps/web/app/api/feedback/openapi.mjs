const json = (schema) => ({ content: { "application/json": { schema } } });
const errors = {
    400: { description: "Invalid input." },
    403: { description: "Permission or same-origin check failed." },
    404: { description: "Target or feedback is unavailable." },
    413: {
        description: "Body exceeds 20,000 bytes (1,024 for state changes).",
    },
    429: { description: "Rate limit exceeded." },
    503: { description: "Unavailable; refresh status before retrying." },
};
const session = [{ CourseLitSession: [] }];
const id = {
    name: "id",
    in: "path",
    required: true,
    schema: { type: "string" },
};
const target = {
    oneOf: [
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "lessonId", "field"],
            properties: {
                kind: { type: "string", enum: ["lesson"] },
                lessonId: { type: "string", maxLength: 128 },
                field: { type: "string", enum: ["title", "content"] },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "path", "componentId"],
            properties: {
                kind: { type: "string", enum: ["page"] },
                path: {
                    type: "string",
                    maxLength: 512,
                    description:
                        "Same-site path without query or fragment; excludes /api/.",
                },
                componentId: {
                    type: "string",
                    minLength: 1,
                    maxLength: 512,
                    description: "Display locator only. Never evaluated.",
                },
                label: { type: "string", maxLength: 160 },
            },
        },
    ],
};
const feedback = {
    type: "object",
    required: [
        "id",
        "text",
        "target",
        "actor",
        "photoMediaIds",
        "state",
        "createdAt",
        "updatedAt",
    ],
    properties: {
        id: { type: "string" },
        text: { type: "string" },
        target,
        actor: {
            type: "object",
            properties: {
                kind: { type: "string", enum: ["visitor", "member", "admin"] },
                userId: { type: "string" },
            },
        },
        photoMediaIds: { type: "array", items: { type: "string" } },
        state: { type: "string", enum: ["open", "closed"] },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
    },
};
const detail = {
    type: "object",
    properties: {
        feedback,
        prompt: {
            type: "string",
            description: "Only returned to a feedback administrator.",
        },
    },
};

export const feedbackApiOpenApi = {
    tags: [
        {
            name: "Contextual Feedback",
            description:
                "Private site feedback. Session identity supplies attribution; API keys are not accepted.",
        },
    ],
    components: {
        securitySchemes: {
            CourseLitSession: {
                type: "apiKey",
                in: "cookie",
                name: "courselit.session_token",
                description:
                    "Existing CourseLit browser session (secure cookie may have __Secure- prefix). Writes require same-origin Origin and application/json.",
            },
        },
    },
    paths: {
        "/api/feedback/{id}/photos/{mediaId}": {
            parameters: [
                id,
                {
                    name: "mediaId",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                },
            ],
            get: {
                tags: ["Contextual Feedback"],
                operationId: "viewFeedbackPhoto",
                summary:
                    "View a private feedback attachment as an administrator",
                security: session,
                responses: {
                    200: {
                        description:
                            "Image streamed with private no-store caching; attachment and tenant ownership are checked.",
                        content: {
                            "image/*": {
                                schema: { type: "string", format: "binary" },
                            },
                        },
                    },
                    ...errors,
                },
            },
        },
        "/api/feedback": {
            post: {
                tags: ["Contextual Feedback"],
                operationId: "submitContextualFeedback",
                summary: "Submit feedback without changing site content",
                security: [],
                description:
                    "Public/member text; photo media IDs only for site/course administrators and the same tenant image library. Six submissions per minute per account/client. Unknown properties, including actor/user IDs, are rejected.",
                requestBody: {
                    required: true,
                    ...json({
                        type: "object",
                        additionalProperties: false,
                        required: ["text", "target"],
                        properties: {
                            text: {
                                type: "string",
                                minLength: 1,
                                maxLength: 4000,
                            },
                            target,
                            photoMediaIds: {
                                type: "array",
                                maxItems: 4,
                                items: { type: "string", maxLength: 128 },
                            },
                        },
                    }),
                },
                responses: {
                    201: {
                        description:
                            "Stored feedback; no content applied or message sent.",
                        ...json(detail),
                    },
                    ...errors,
                },
            },
            get: {
                tags: ["Contextual Feedback"],
                operationId: "listContextualFeedback",
                summary: "List the newest 50 permitted feedback records",
                security: session,
                description:
                    "Administrators see site feedback; members see only their own. Visitors cannot list records.",
                responses: {
                    200: {
                        description: "Private feedback list.",
                        ...json({
                            type: "object",
                            properties: {
                                feedback: { type: "array", items: feedback },
                            },
                        }),
                    },
                    ...errors,
                },
            },
        },
        "/api/feedback/{id}": {
            parameters: [id],
            get: {
                tags: ["Contextual Feedback"],
                operationId: "getContextualFeedback",
                summary: "Read feedback and an admin-only preparation prompt",
                security: session,
                responses: {
                    200: { description: "Permitted record.", ...json(detail) },
                    ...errors,
                },
            },
            post: {
                tags: ["Contextual Feedback"],
                operationId: "setContextualFeedbackState",
                summary: "Close or reopen feedback as an administrator",
                security: session,
                requestBody: {
                    required: true,
                    ...json({
                        type: "object",
                        additionalProperties: false,
                        required: ["action"],
                        properties: {
                            action: {
                                type: "string",
                                enum: ["close", "reopen"],
                            },
                        },
                    }),
                },
                responses: {
                    200: {
                        description:
                            "Updated. Closing schedules deletion after 90 days; reopening clears expiry.",
                        ...json(detail),
                    },
                    ...errors,
                },
            },
            delete: {
                tags: ["Contextual Feedback"],
                operationId: "deleteContextualFeedback",
                summary:
                    "Remove own feedback or remove feedback as an administrator",
                security: session,
                responses: {
                    200: {
                        description:
                            "Deleted. Referenced media library assets are retained.",
                        ...json({
                            type: "object",
                            properties: { deleted: { type: "boolean" } },
                        }),
                    },
                    ...errors,
                },
            },
        },
    },
};
