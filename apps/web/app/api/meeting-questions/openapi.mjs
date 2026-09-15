const string = { type: "string" };
const revision = { type: "integer", minimum: 0 };
const id = { type: "string", pattern: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$" };
const object = (properties, required = Object.keys(properties)) => ({
    type: "object",
    additionalProperties: false,
    properties,
    required,
});
const array = (items, maxItems) => ({
    type: "array",
    items,
    ...(maxItems ? { maxItems } : {}),
});
const json = (schema) => ({ content: { "application/json": { schema } } });
const title = { type: "string", minLength: 1, maxLength: 240 };
const question = object({
    id,
    number: { type: "integer", minimum: 1, maximum: 10000 },
    title,
    group: { type: "string", enum: ["start", "optional", "humanitix"] },
    context: { type: "string", maxLength: 8000 },
    candidateGroups: array(
        object({
            title,
            options: array(
                object({
                    label: title,
                    text: { type: "string", minLength: 1, maxLength: 4000 },
                }),
                12,
            ),
        }),
        16,
    ),
    locations: array(
        object({
            path: {
                type: "string",
                maxLength: 500,
                pattern: "^/(?!/)[a-zA-Z0-9/_-]*$",
            },
            componentId: {
                type: "string",
                maxLength: 200,
                pattern: "^[a-zA-Z0-9_-]{1,200}$",
            },
            label: title,
        }),
        12,
    ),
});
const setInput = object({
    id,
    title,
    intro: { type: "string", maxLength: 8000 },
    questions: { ...array(question, 80), minItems: 1 },
});
const set = object({
    ...setInput.properties,
    revision,
    updatedAt: { type: "string", format: "date-time" },
});
const viewer = object({ userId: string, name: string });
const author = {
    oneOf: [
        object({
            kind: { type: "string", enum: ["account"] },
            ...viewer.properties,
        }),
        object({ kind: { type: "string", enum: ["removed"] } }),
    ],
};
const history = object({
    revision,
    baseRevision: revision,
    mutationId: { type: "string", format: "uuid" },
    text: { type: "string", maxLength: 4000 },
    at: { type: "string", format: "date-time" },
});
const answer = object({
    id: string,
    setId: id,
    questionId: id,
    author,
    text: { type: "string", maxLength: 4000 },
    revision,
    history: array(history, 500),
    updatedAt: { type: "string", format: "date-time" },
});
const errors = {
    400: {
        description:
            "Invalid/unknown fields, duplicate question IDs or numbers, malformed JSON.",
    },
    401: { description: "Signed-in account unavailable." },
    403: {
        description:
            "Active site:manage/course:manage_any account required; cross-origin writes and every Member Mimic request refused.",
    },
    404: { description: "Site or meeting question not found." },
    409: {
        description:
            "Stale revision, conflicting mutation ID, retained question removal, account closing or 500-revision answer limit. Preserve the local draft.",
    },
    413: {
        description:
            "Request exceeds byte limit: question set 128 KiB; answer 12 KiB.",
    },
    415: { description: "Writes require application/json." },
    429: {
        description:
            "Per-site/per-user limit: 120 reads or 60 writes per minute per operation.",
    },
    503: {
        description:
            "Unavailable. Check persisted state before retrying with the same mutation ID.",
    },
};
export const meetingQuestionsApiOpenApi = {
    tags: [
        {
            name: "Meeting questions",
            description:
                "Private domain-scoped questions and per-author editable answers. No notifications, automatic publication or TTL.",
        },
    ],
    paths: {
        "/api/meeting-questions": {
            get: {
                tags: ["Meeting questions"],
                summary:
                    "List this site's sets, numerically ordered questions, answers/history and current viewer",
                responses: {
                    200: {
                        description:
                            "Private no-store snapshot. Removed accounts have no exposed identity.",
                        ...json(
                            object({
                                sets: array(set),
                                answers: array(answer),
                                viewer,
                            }),
                        ),
                    },
                    ...errors,
                },
            },
            post: {
                tags: ["Meeting questions"],
                summary: "Create or update one complete question set",
                description:
                    "expectedRevision 0 creates; updates require current revision. Identical content is idempotent. IDs already in a set cannot be omitted; existing answers are untouched. Same-origin authenticated JSON only.",
                requestBody: {
                    required: true,
                    ...json(
                        object({ set: setInput, expectedRevision: revision }),
                    ),
                },
                responses: {
                    200: {
                        description: "Saved or already-current set",
                        ...json(object({ set })),
                    },
                    ...errors,
                },
            },
        },
        "/api/meeting-questions/answers": {
            post: {
                tags: ["Meeting questions"],
                summary: "Save only the signed-in author's answer",
                description:
                    "expectedRevision 0 creates. text may be empty to clear. mutationId identifies the logical save: retry the identical body after an uncertain result. Restoring earlier text is a new save/revision. Other authors' answers cannot be targeted. Every accepted revision is retained.",
                requestBody: {
                    required: true,
                    ...json(
                        object({
                            setId: id,
                            questionId: id,
                            text: { type: "string", maxLength: 4000 },
                            expectedRevision: revision,
                            mutationId: { type: "string", format: "uuid" },
                        }),
                    ),
                },
                responses: {
                    ...errors,
                    200: {
                        description:
                            "Saved, or original mutation replayed; answer includes the current state even after a later edit",
                        ...json(
                            object({
                                kind: { type: "string", enum: ["saved"] },
                                answer,
                                replayed: { type: "boolean" },
                                appliedRevision: revision,
                            }),
                        ),
                    },
                    409: {
                        description:
                            "Stale revision/conflicting mutation (typed conflict), or account/history limit error. Preserve the draft.",
                        ...json({
                            oneOf: [
                                object({
                                    kind: {
                                        type: "string",
                                        enum: ["conflict"],
                                    },
                                    current: {
                                        ...answer,
                                        nullable: true,
                                    },
                                    message: string,
                                }),
                                object({
                                    error: object({
                                        code: string,
                                        message: string,
                                    }),
                                }),
                            ],
                        }),
                    },
                },
            },
        },
    },
};
