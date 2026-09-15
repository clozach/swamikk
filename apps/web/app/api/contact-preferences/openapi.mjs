const json = (schema) => ({ content: { "application/json": { schema } } });
const contact = {
    oneOf: ["email", "voice", "text"].map((kind) => ({
        type: "object",
        additionalProperties: false,
        required: ["kind", "value"],
        properties: {
            kind: { type: "string", enum: [kind] },
            value: { type: "string", maxLength: kind === "email" ? 254 : 40 },
        },
    })),
};
const view = {
    type: "object",
    required: ["revision", "contact", "checkIns", "photo"],
    properties: {
        revision: { type: "integer", minimum: 0 },
        contact,
        checkIns: { type: "string", enum: ["none", "occasional"] },
        photo: {
            oneOf: [
                {
                    type: "object",
                    required: ["kind"],
                    properties: { kind: { type: "string", enum: ["none"] } },
                },
                {
                    type: "object",
                    required: ["kind", "version"],
                    properties: {
                        kind: { type: "string", enum: ["shared"] },
                        version: { type: "integer", minimum: 1 },
                    },
                },
            ],
        },
    },
};
const errors = {
    400: { description: "Invalid preference or undecodable photo." },
    403: {
        description:
            "Sign-in, same-origin request, or current Mimic authorization required. Mimic cannot write.",
    },
    409: {
        description: "Stale revision: preserve input and reload before saving.",
    },
    413: { description: "JSON exceeds 3 MB or decoded photo exceeds 2 MB." },
    429: { description: "Too many changes; retry later." },
    503: {
        description:
            "Request unavailable; preserve input and check saved status.",
    },
};
export const contactPreferencesApiOpenApi = {
    tags: [
        {
            name: "Contact preferences",
            description:
                "Optional private contact/check-in/photo sharing. Separate from newsletter consent; member photos are private recognition aids.",
        },
    ],
    paths: {
        "/api/contact-preferences": {
            get: {
                tags: ["Contact preferences"],
                operationId: "getContactPreferences",
                security: [{ CourseLitSession: [] }],
                summary: "Read own preferences or an authorized Mimic subject",
                description:
                    "No-store. Rechecks active account, tenant and Mimic actor session. Returns photo presence/version only; never bytes or a public asset URL. No arbitrary target ID is accepted. Missing records return no check-ins/no photo without creating a record.",
                responses: {
                    200: {
                        description:
                            "Saved preferences or unpersisted defaults.",
                        ...json(view),
                    },
                    ...errors,
                },
            },
            put: {
                tags: ["Contact preferences"],
                operationId: "saveContactPreferences",
                security: [{ CourseLitSession: [] }],
                summary: "Save own optional private preferences",
                description:
                    "Same-origin JSON, at most 12 writes/minute. Revision compare-and-swap prevents stale tabs restoring removed photos. Contact email does not change sign-in identity. Photo replacement requires explicit base64 bytes; JPEG/PNG/WebP are decoded with a 16-megapixel limit, resized to at most 512px, stripped of metadata and stored as private JPEG. Removal deletes the bytes atomically. No marketing consent change or external send.",
                requestBody: {
                    required: true,
                    ...json({
                        ...view,
                        additionalProperties: false,
                        properties: {
                            ...view.properties,
                            photo: {
                                oneOf: ["keep", "remove"]
                                    .map((kind) => ({
                                        type: "object",
                                        additionalProperties: false,
                                        required: ["kind"],
                                        properties: {
                                            kind: {
                                                type: "string",
                                                enum: [kind],
                                            },
                                        },
                                    }))
                                    .concat([
                                        {
                                            type: "object",
                                            additionalProperties: false,
                                            required: ["kind", "data"],
                                            properties: {
                                                kind: {
                                                    type: "string",
                                                    enum: ["replace"],
                                                },
                                                data: {
                                                    type: "string",
                                                    maxLength: 2800000,
                                                    description:
                                                        "Base64 image bytes, without a data-URL prefix.",
                                                },
                                            },
                                        },
                                    ]),
                            },
                        },
                    }),
                },
                responses: {
                    200: { description: "Saved preferences.", ...json(view) },
                    ...errors,
                },
            },
        },
        "/api/contact-preferences/photo": {
            put: {
                tags: ["Contact preferences"],
                operationId: "saveContactPreferencePhoto",
                security: [{ CourseLitSession: [] }],
                summary: "Save an own private photo immediately",
                description:
                    "Same-origin JSON and active ownership required; Mimic cannot write. Shares the preference revision compare-and-swap. Reads the saved contact/check-in fields and preserves them, so pending form edits are not submitted by a photo change. Same bounded JPEG processing as preference saves. No external delivery or MediaLit object is created.",
                requestBody: {
                    required: true,
                    ...json({
                        type: "object",
                        additionalProperties: false,
                        required: ["revision", "photo"],
                        properties: {
                            revision: { type: "integer", minimum: 0 },
                            photo: {
                                oneOf: [
                                    ...["keep", "remove"].map((kind) => ({
                                        type: "object",
                                        additionalProperties: false,
                                        required: ["kind"],
                                        properties: {
                                            kind: {
                                                type: "string",
                                                enum: [kind],
                                            },
                                        },
                                    })),
                                    {
                                        type: "object",
                                        additionalProperties: false,
                                        required: ["kind", "data"],
                                        properties: {
                                            kind: {
                                                type: "string",
                                                enum: ["replace"],
                                            },
                                            data: {
                                                type: "string",
                                                minLength: 1,
                                                maxLength: 2800000,
                                                description:
                                                    "Base64 image bytes, without data URL prefix.",
                                            },
                                        },
                                    },
                                ],
                            },
                        },
                    }),
                },
                responses: {
                    200: {
                        description:
                            "Saved photo and unchanged saved contact preferences.",
                        ...json(view),
                    },
                    ...errors,
                },
            },
            get: {
                tags: ["Contact preferences"],
                operationId: "getContactPreferencePhoto",
                parameters: [
                    {
                        in: "query",
                        name: "userId",
                        required: false,
                        schema: { type: "string" },
                        description:
                            "Same-tenant target for current member managers; omitted for self/Mimic.",
                    },
                ],
                security: [{ CourseLitSession: [] }],
                summary:
                    "Read a private photo as its owner, current member manager or Mimic subject",
                description:
                    "Optional userId selects an active same-tenant member only for current member managers; ordinary members cannot select others, and Mimic is restricted to its subject. No media IDs or public URLs. Private no-store JPEG response with same-origin resource policy. Removed/unshared photo returns 404; revoked or expired authorization cannot fetch it.",
                responses: {
                    200: {
                        description: "Private JPEG.",
                        content: {
                            "image/jpeg": {
                                schema: { type: "string", format: "binary" },
                            },
                        },
                    },
                    404: { description: "No shared photo." },
                    ...errors,
                },
            },
        },
    },
};
