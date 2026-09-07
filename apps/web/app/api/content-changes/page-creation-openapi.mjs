export const pageCreationPatch = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "title", "content", "intent", "materials"],
    properties: {
        kind: { type: "string", enum: ["page-create"] },
        title: { type: "string", minLength: 1, maxLength: 240 },
        intent: { type: "string", minLength: 1, maxLength: 4000 },
        materials: { type: "string", maxLength: 20000 },
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
                "Safe text structure and links only. No new HTML, scripts, assets or opaque embeds.",
        },
    },
};
export const pageCreationInput = {
    type: "object",
    additionalProperties: false,
    required: ["target", "patch", "summary"],
    properties: {
        target: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "pageId"],
            properties: {
                kind: { type: "string", enum: ["page-create"] },
                pageId: {
                    type: "string",
                    minLength: 1,
                    maxLength: 128,
                    pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
                    description:
                        "Exact new /p/ route. Existing routes and removed- reserved prefix are rejected; no automatic suffix.",
                },
            },
        },
        patch: pageCreationPatch,
        summary: { type: "string", minLength: 1, maxLength: 2000 },
    },
};
