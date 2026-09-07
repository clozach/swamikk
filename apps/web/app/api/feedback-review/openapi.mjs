const json = (schema) => ({ content: { "application/json": { schema } } });
const string = { type: "string" };
const leaseProperties = {
    feedbackId: string,
    generation: { type: "integer", minimum: 1 },
    leaseId: string,
    inputHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
};
const lease = {
    type: "object",
    additionalProperties: false,
    required: Object.keys(leaseProperties),
    properties: leaseProperties,
};
const replacement = {
    oneOf: [
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "text"],
            properties: {
                kind: { enum: ["text"] },
                text: { type: "string", minLength: 1, maxLength: 20000 },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "content"],
            properties: {
                kind: { enum: ["rich-text"] },
                content: {
                    type: "object",
                    additionalProperties: false,
                    required: ["type", "content"],
                    properties: {
                        type: { enum: ["doc"] },
                        content: {
                            type: "array",
                            maxItems: 1000,
                            items: { type: "object" },
                        },
                    },
                },
            },
        },
    ],
};
const result = {
    oneOf: [
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "summary", "replacement"],
            properties: {
                kind: { enum: ["text-proposal"] },
                summary: { type: "string", maxLength: 2000 },
                replacement,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "summary", "reason"],
            properties: {
                kind: { enum: ["escalation"] },
                summary: { type: "string", maxLength: 2000 },
                reason: {
                    enum: [
                        "human-review",
                        "private-or-access",
                        "payment-or-policy",
                        "structure-or-media",
                        "ambiguous-target",
                    ],
                },
            },
        },
    ],
};
const responses = {
    200: {
        description:
            "Bounded review claim/context/result. No-store; no administrator identity or approval authority.",
    },
    400: { description: "Unknown, unsafe or invalid input." },
    401: {
        description:
            "Grant/issuer unavailable, expired, revoked or wrong tenant.",
    },
    403: { description: "Mimic or administrator permission refusal." },
    409: {
        description:
            "Stale/expired lease, conflicting output, escalation required or account closure.",
    },
    413: { description: "Body exceeds 64 KiB or context complexity limit." },
    429: { description: "Rate limit." },
    503: {
        description:
            "Retain and retry the same result; never infer publication.",
    },
};
const reviewPost = (operationId, summary, schema) => ({
    post: {
        tags: ["Feedback Review"],
        operationId,
        summary,
        security: [{ feedbackReviewer: [] }],
        requestBody: { required: true, ...json(schema) },
        responses,
    },
});
export const feedbackReviewOpenApi = {
    components: {
        securitySchemes: {
            feedbackReviewer: {
                type: "http",
                scheme: "bearer",
                description:
                    "Dedicated fbr_ grant; accepted only on feedback-review claim/context/result, never a general API key or administrator session.",
            },
        },
    },
    paths: {
        "/api/feedback-review/claim": reviewPost(
            "claimFeedbackReview",
            "Claim one feedback lease or complete a previously accepted intent",
            { type: "object", additionalProperties: false },
        ),
        "/api/feedback-review/context": reviewPost(
            "readFeedbackReviewContext",
            "Read one freshly verified public text field or escalation-only context",
            lease,
        ),
        "/api/feedback-review/result": reviewPost(
            "submitFeedbackReviewResult",
            "Retain one unapproved text proposal or escalation; never apply or publish",
            {
                ...lease,
                required: [...lease.required, "result"],
                properties: { ...leaseProperties, result },
            },
        ),
        "/api/feedback-review/grants": {
            get: {
                tags: ["Feedback Review"],
                operationId: "listFeedbackReviewGrants",
                summary: "Settings administrator lists redacted grant metadata",
                security: [{ CourseLitSession: [] }],
                responses,
            },
            post: {
                tags: ["Feedback Review"],
                operationId: "issueFeedbackReviewGrant",
                summary:
                    "Settings administrator explicitly issues a tenant-bound restricted credential",
                security: [{ CourseLitSession: [] }],
                requestBody: {
                    required: true,
                    ...json({
                        type: "object",
                        additionalProperties: false,
                        required: ["name", "scopes", "expiresInDays"],
                        properties: {
                            name: {
                                type: "string",
                                minLength: 1,
                                maxLength: 80,
                            },
                            scopes: {
                                type: "array",
                                minItems: 1,
                                maxItems: 2,
                                uniqueItems: true,
                                items: {
                                    enum: [
                                        "public-page-text",
                                        "public-lesson-text",
                                    ],
                                },
                            },
                            expiresInDays: {
                                type: "integer",
                                minimum: 1,
                                maximum: 30,
                            },
                        },
                    }),
                },
                responses: {
                    ...responses,
                    201: {
                        description:
                            "Raw credential returned exactly once in this no-store response; persist it outside model context/logs.",
                    },
                },
            },
        },
        "/api/feedback-review/grants/{id}": {
            parameters: [
                { in: "path", name: "id", required: true, schema: string },
            ],
            post: {
                tags: ["Feedback Review"],
                operationId: "revokeFeedbackReviewGrant",
                summary:
                    "Stop new grant admissions; report any admitted operations still finishing",
                security: [{ CourseLitSession: [] }],
                requestBody: {
                    required: true,
                    ...json({
                        type: "object",
                        additionalProperties: false,
                        required: ["action"],
                        properties: { action: { enum: ["revoke"] } },
                    }),
                },
                responses,
            },
        },
    },
};
