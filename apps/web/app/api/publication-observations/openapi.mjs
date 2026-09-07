const id = {
    type: "string",
    minLength: 1,
    maxLength: 128,
    pattern: "^[a-zA-Z0-9_-]+$",
};
const common = {
    tags: ["Publication observations"],
    security: [{ CourseLitSession: [] }],
};
const errors = {
    400: {
        description:
            "Invalid or excessive identifiers/JSON; caller-supplied evidence is rejected.",
    },
    403: {
        description:
            "Administrator and same-origin writes required. Member Mimic is refused.",
    },
    404: {
        description: "Course unavailable in this tenant and ownership scope.",
    },
    429: { description: "Observation rate limit exceeded." },
    503: {
        description:
            "Result unavailable. Read persisted evidence before retrying.",
    },
};
export const publicationObservationsApiOpenApi = {
    tags: [
        {
            name: "Publication observations",
            description:
                "Verified publication upper bounds distinct from true first-publication dates.",
        },
    ],
    paths: {
        "/api/publication-observations": {
            get: {
                ...common,
                operationId: "readPublicationObservationCandidates",
                summary:
                    "Review published lessons and existing observation evidence",
                parameters: [
                    {
                        name: "courseId",
                        in: "query",
                        required: true,
                        schema: id,
                    },
                    { name: "cursor", in: "query", schema: id },
                ],
                responses: {
                    200: {
                        description:
                            "Read-only {courseId,published,releaseRevision,candidates,hasMore,nextCursor}. Up to 100 published candidates include lessonId,title,groupId,hasFirstPublicationDate,publishedBy,availabilityWitnessCurrent.",
                    },
                    ...errors,
                },
            },
            post: {
                ...common,
                operationId: "observePublishedLessons",
                summary:
                    "Record bounded server-authored observations of selected published lessons",
                description:
                    "Records MongoDB timestamps and a guarded joint lesson/course witness. Never writes firstPublishedAt or grants membership/retained access. Course races can retain publication-only evidence; lesson races skip the stale observation. Each item has an explicit result, not an assumed batch success.",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                additionalProperties: false,
                                required: ["courseId", "lessonIds"],
                                properties: {
                                    courseId: id,
                                    lessonIds: {
                                        type: "array",
                                        minItems: 1,
                                        maxItems: 100,
                                        uniqueItems: true,
                                        items: id,
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description:
                            "{courseId,results}: per-lesson recorded/already-recorded/publication-only with publishedBy and witnessAt, skipped with reason, or uncertain. None asserts that an earlier membership's unknown history has been repaired.",
                    },
                    ...errors,
                },
            },
        },
    },
};
