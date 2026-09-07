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
                "Optional private contact/check-in/photo sharing. Separate from newsletter consent and public avatars.",
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
            get: {
                tags: ["Contact preferences"],
                operationId: "getContactPreferencePhoto",
                security: [{ CourseLitSession: [] }],
                summary:
                    "Read the private photo through current owner/Mimic authorization",
                description:
                    "No arbitrary member/media IDs. Private no-store JPEG response with same-origin resource policy. Removed/unshared photo returns 404; revoked or expired authorization cannot fetch it.",
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
