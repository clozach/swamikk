const id = {
    type: "string",
    minLength: 1,
    maxLength: 128,
    pattern: "^[a-zA-Z0-9_-]+$",
};
export const pageWidgetTarget = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "pageId", "widgetId", "field"],
    properties: {
        kind: { type: "string", enum: ["page-widget"] },
        pageId: id,
        widgetId: id,
        field: { type: "string", minLength: 1, maxLength: 80 },
    },
};
export const pageWidgetPatch = {
    oneOf: [
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "text"],
            properties: {
                kind: { type: "string", enum: ["text"] },
                text: { type: "string", maxLength: 20000 },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "content"],
            properties: {
                kind: { type: "string", enum: ["rich-text"] },
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
                },
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "mediaId", "alt"],
            properties: {
                kind: { type: "string", enum: ["image"] },
                mediaId: id,
                alt: { type: "string", maxLength: 1000 },
            },
        },
    ],
};
export const pageWidgetInput = {
    type: "object",
    additionalProperties: false,
    required: ["target", "patch", "summary"],
    properties: {
        feedbackId: id,
        target: pageWidgetTarget,
        patch: pageWidgetPatch,
        summary: { type: "string", minLength: 1, maxLength: 2000 },
    },
};
export const pageWidgetPaths = {
    "/api/content-changes/page-widget": {
        get: {
            tags: ["Content Changes"],
            operationId: "getEditablePageWidget",
            summary:
                "Read supported fields from one published native page block",
            security: [{ CourseLitSession: [] }],
            description:
                "Requires active site:manage and no Member Mimic. Existing non-shared blocks only. Returns resolved text/image fields and whether they come from native defaults. This does not create/publish a page draft. Prepare a proposal through POST /api/content-changes; image IDs must resolve to same-tenant public native images. Unknown/shared/structural fields are rejected. Recovery settings cannot be submitted directly.",
            parameters: ["pageId", "widgetId"].map((name) => ({
                name,
                in: "query",
                required: true,
                schema: id,
            })),
            responses: {
                200: {
                    description:
                        "Resolved fields and authoritative page/widget IDs. Each field has field, kind (text, rich-text or image), label, value and defaultDerived.",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["target", "widgetName", "fields"],
                                properties: {
                                    target: { type: "object" },
                                    widgetName: { type: "string" },
                                    fields: {
                                        type: "array",
                                        items: { type: "object" },
                                    },
                                },
                            },
                        },
                    },
                },
                400: { description: "Unsupported target or invalid query." },
                403: {
                    description:
                        "Site editor permission required; Member Mimic cannot author.",
                },
                404: { description: "Page not found in this tenant." },
                429: { description: "Rate limited." },
            },
        },
    },
};
