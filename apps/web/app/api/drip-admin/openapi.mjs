const id = {
    type: "string",
    minLength: 1,
    maxLength: 128,
    pattern: "^[a-zA-Z0-9_-]+$",
};
const rule = {
    oneOf: [
        {
            type: "object",
            additionalProperties: false,
            required: ["kind"],
            properties: { kind: { const: "available" } },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "at"],
            properties: {
                kind: { const: "exact" },
                at: { type: "string", format: "date-time" },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "delayInMillis"],
            properties: {
                kind: { const: "relative" },
                delayInMillis: {
                    type: "integer",
                    minimum: 0,
                    maximum: 315360000000,
                },
            },
        },
    ],
};
const patch = {
    type: "object",
    additionalProperties: false,
    required: ["groupId", "rule", "groupOrder", "notificationEnabled"],
    properties: {
        groupId: id,
        rule,
        groupOrder: {
            type: "array",
            minItems: 1,
            maxItems: 500,
            uniqueItems: true,
            items: id,
        },
        notificationEnabled: { type: "boolean" },
    },
};
const json = (schema) => ({ content: { "application/json": { schema } } });
const version = { type: "integer", minimum: 1 };
const response = {
    description:
        "Persisted versioned DripChange and its discriminated outcome. Native course groups and receipts are never returned.",
    ...json({
        type: "object",
        required: ["change"],
        properties: { change: { $ref: "#/components/schemas/DripChange" } },
    }),
};
const errors = {
    400: { description: "Invalid target, patch or bounded JSON." },
    403: {
        description:
            "Course administrator and same-origin writes required; Member Mimic is refused.",
    },
    404: {
        description:
            "Course or draft unavailable in this tenant and ownership scope.",
    },
    409: {
        description:
            "Conflicting review/application, or an availability-mode migration is required for current memberships.",
    },
    429: { description: "Too many requests." },
    503: {
        description:
            "Result is unavailable. Refresh or reconcile before retrying.",
    },
};
const common = {
    tags: ["Release scheduling"],
    security: [{ CourseLitSession: [] }],
};
export const dripAdminComponents = {
    schemas: {
        DripChange: {
            type: "object",
            required: [
                "id",
                "courseId",
                "version",
                "patch",
                "preview",
                "previewHash",
                "state",
                "history",
                "preparedBy",
                "preparedAt",
                "createdAt",
                "updatedAt",
            ],
            properties: {
                id,
                courseId: id,
                version,
                patch,
                preview: {
                    type: "object",
                    description:
                        "Exact before/after section rules and message templates, audience/delivery counts, relative date samples, unknowns, five-minute expiry and effects hash.",
                },
                previewHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
                state: {
                    type: "object",
                    required: ["kind"],
                    properties: {
                        kind: {
                            enum: [
                                "draft",
                                "stale",
                                "applying",
                                "uncertain",
                                "applied",
                                "not-applied",
                                "discarded",
                            ],
                        },
                        operationId: { type: "string" },
                        approvedBy: id,
                        at: { type: "string", format: "date-time" },
                        reason: { type: "string" },
                    },
                },
                history: {
                    type: "array",
                    maxItems: 20,
                    items: {
                        type: "object",
                        description:
                            "Earlier complete reviewed version; never authorizes a current write.",
                    },
                },
                preparedBy: id,
                preparedAt: { type: "string", format: "date-time" },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
                restoresChangeId: id,
            },
        },
    },
};
export const dripAdminPaths = {
    "/api/drip-admin": {
        get: {
            ...common,
            operationId: "readReleaseSchedules",
            summary:
                "List manageable collections or read their sections and recent drafts",
            parameters: [{ name: "courseId", in: "query", schema: id }],
            responses: {
                200: {
                    description:
                        "Without courseId: {courses:[{courseId,title,published}]}. With courseId: {course:{courseId,title,published,sections,availabilityChangesRestricted,changes}}. Read-only, no-store; no access ledger initialization.",
                },
                ...errors,
            },
        },
        post: {
            ...common,
            operationId: "prepareReleaseSchedule",
            summary: "Persist an unapproved release schedule draft",
            requestBody: {
                required: true,
                ...json({
                    type: "object",
                    additionalProperties: false,
                    required: ["courseId", "patch"],
                    properties: { courseId: id, patch },
                }),
            },
            responses: { 201: response, ...errors },
        },
    },
    "/api/drip-admin/{id}": {
        parameters: [{ name: "id", in: "path", required: true, schema: id }],
        get: {
            ...common,
            operationId: "readReleaseScheduleDraft",
            summary: "Read a persisted release draft and result",
            responses: { 200: response, ...errors },
        },
        post: {
            ...common,
            operationId: "actOnReleaseScheduleDraft",
            summary:
                "Refresh, approve, reconcile, discard or prepare restoration",
            description:
                "Approval requires the exact version/hash, fresh course and audience, then an atomic native course version guard. Reconciliation reads the native receipt or fences a delayed write. Restoration is another unapproved draft. None of these actions retracts viewed content or dispatched mail.",
            requestBody: {
                required: true,
                ...json({
                    oneOf: [
                        {
                            type: "object",
                            additionalProperties: false,
                            required: ["action", "version", "previewHash"],
                            properties: {
                                action: { const: "approve" },
                                version,
                                previewHash: {
                                    type: "string",
                                    pattern: "^[a-f0-9]{64}$",
                                },
                            },
                        },
                        {
                            type: "object",
                            additionalProperties: false,
                            required: ["action", "version"],
                            properties: {
                                action: { const: "refresh" },
                                version,
                                patch,
                            },
                        },
                        {
                            type: "object",
                            additionalProperties: false,
                            required: ["action", "version"],
                            properties: {
                                action: { enum: ["discard", "restore"] },
                                version,
                            },
                        },
                        {
                            type: "object",
                            additionalProperties: false,
                            required: ["action"],
                            properties: { action: { const: "reconcile" } },
                        },
                    ],
                }),
            },
            responses: { 200: response, ...errors },
        },
    },
};
export const dripAdminApiOpenApi = {
    tags: [
        {
            name: "Release scheduling",
            description: "O11 versioned native CourseLit release schedules.",
        },
    ],
    paths: dripAdminPaths,
    components: dripAdminComponents,
};
