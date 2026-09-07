const json = (schema) => ({ content: { "application/json": { schema } } });
const session = [{ CourseLitSession: [] }];
const patch = {
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    properties: {
        title: { type: "string", minLength: 1, maxLength: 240 },
        content: {
            type: "object",
            additionalProperties: false,
            required: ["type", "content"],
            properties: {
                type: { type: "string", enum: ["doc"] },
                content: {
                    type: "array",
                    maxItems: 1000,
                    items: { type: "object" },
                },
            },
            description:
                "Safe ProseMirror text structure. Existing opaque/media nodes must be retained unchanged; new HTML/media is rejected.",
        },
    },
};
const version = { type: "integer", minimum: 1 };
const previewHash = { type: "string", pattern: "^[a-f0-9]{64}$" };
const change = {
    type: "object",
    description:
        "ContentChange from @courselit/common-models: id, target, version, summary, patch, baseline {revision,fingerprint,snapshot,courseId,published}, preview {before,after}, previewHash, preparedBy/At, history, approvals, state, timestamps. state is discriminated by kind; applying/uncertain/applied include operationId and approval; applied includes appliedAt/appliedRevision.",
    properties: {
        id: { type: "string" },
        version,
        previewHash,
        state: {
            type: "object",
            required: ["kind"],
            properties: {
                kind: {
                    type: "string",
                    enum: [
                        "proposed",
                        "applying",
                        "applied",
                        "stale",
                        "failed",
                        "uncertain",
                        "rejected",
                    ],
                },
            },
        },
    },
};
const detail = { type: "object", properties: { change } };
const responses = {
    200: {
        description:
            "Current proposal/result. Inspect state.kind; HTTP success alone does not mean applied.",
        ...json(detail),
    },
    400: { description: "Invalid/unsupported proposal." },
    403: {
        description:
            "Sign-in, editing permission, or same-origin check failed.",
    },
    404: { description: "Proposal/target unavailable or not permitted." },
    409: {
        description:
            "Stale approval, unsettled target operation, or unsupported recovery/removal.",
    },
    413: { description: "Body exceeds 131,072 bytes." },
    429: { description: "Rate limit exceeded." },
    503: {
        description:
            "Unavailable; fetch/reconcile the existing proposal before retrying.",
    },
};
const action = (name, properties = {}, required = []) => ({
    type: "object",
    additionalProperties: false,
    required: ["action", ...required],
    properties: { action: { type: "string", enum: [name] }, ...properties },
});

export const contentChangesApiOpenApi = {
    tags: [
        {
            name: "Content Changes",
            description:
                "Session-authenticated versioned proposals. Creating/revising is draft-only. Agent output is data; a separate approval is required to apply.",
        },
    ],
    paths: {
        "/api/content-changes": {
            post: {
                tags: ["Content Changes"],
                operationId: "prepareContentChange",
                summary: "Capture baseline and prepare a text lesson change",
                security: session,
                requestBody: {
                    required: true,
                    ...json({
                        type: "object",
                        additionalProperties: false,
                        required: ["target", "patch", "summary"],
                        properties: {
                            feedbackId: { type: "string", maxLength: 128 },
                            target: {
                                type: "object",
                                additionalProperties: false,
                                required: ["kind", "lessonId"],
                                properties: {
                                    kind: { type: "string", enum: ["lesson"] },
                                    lessonId: {
                                        type: "string",
                                        maxLength: 128,
                                    },
                                },
                            },
                            patch,
                            summary: {
                                type: "string",
                                minLength: 1,
                                maxLength: 2000,
                            },
                        },
                    }),
                },
                responses: {
                    ...responses,
                    201: {
                        description: "Draft captured; lesson is unchanged.",
                        ...json(detail),
                    },
                },
            },
            get: {
                tags: ["Content Changes"],
                operationId: "listContentChanges",
                summary: "List newest 50 site proposals as an administrator",
                security: session,
                responses: {
                    ...responses,
                    200: {
                        description: "Proposals, newest first.",
                        ...json({
                            type: "object",
                            properties: {
                                changes: { type: "array", items: change },
                            },
                        }),
                    },
                },
            },
        },
        "/api/content-changes/{id}": {
            parameters: [
                {
                    name: "id",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                },
            ],
            get: {
                tags: ["Content Changes"],
                operationId: "getContentChange",
                summary: "Read exact preview and current application state",
                security: session,
                responses,
            },
            post: {
                tags: ["Content Changes"],
                operationId: "actOnContentChange",
                summary:
                    "Revise, approve/apply, reject, reconcile, or prepare recovery",
                security: session,
                description:
                    "Approve must echo the displayed version and previewHash. Duplicate approval never applies twice. Reconcile reads the atomic receipt or fences an interrupted write without changing content. Revert only prepares a separate reverse proposal requiring its own approval; later lesson edits prevent automatic recovery.",
                requestBody: {
                    required: true,
                    ...json({
                        oneOf: [
                            action(
                                "revise",
                                {
                                    version,
                                    patch,
                                    summary: {
                                        type: "string",
                                        minLength: 1,
                                        maxLength: 2000,
                                    },
                                },
                                ["version", "patch", "summary"],
                            ),
                            action("approve", { version, previewHash }, [
                                "version",
                                "previewHash",
                            ]),
                            action("reject", { version }, ["version"]),
                            action("reconcile"),
                            action("revert", { version }, ["version"]),
                        ],
                    }),
                },
                responses,
            },
            delete: {
                tags: ["Content Changes"],
                operationId: "deleteUnappliedContentChange",
                summary:
                    "Remove an unapplied settled proposal as an administrator",
                security: session,
                description:
                    "Applied snapshots and unresolved operations are retained for audit/recovery.",
                responses: {
                    ...responses,
                    200: {
                        description: "Removed.",
                        ...json({
                            type: "object",
                            properties: { deleted: { type: "boolean" } },
                        }),
                    },
                },
            },
        },
    },
};
