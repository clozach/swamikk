const id = {
    type: "string",
    minLength: 1,
    maxLength: 128,
    pattern: "^[a-zA-Z0-9_-]+$",
};
const path = {
    type: "string",
    minLength: 1,
    maxLength: 300,
    pattern: "^[A-Za-z0-9_-]+(\\.[A-Za-z0-9_-]+){0,23}$",
    description:
        "Dot path of one string inside the block's settings (or its defaults), as listed by the leaves endpoint.",
};
const text = { type: "string", maxLength: 20000 };
const json = (schema) => ({ content: { "application/json": { schema } } });
const session = [{ CourseLitSession: [] }];
export const textEditTarget = {
    oneOf: [
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "pageId", "widgetId", "path"],
            properties: {
                kind: { type: "string", enum: ["page-widget-text"] },
                pageId: id,
                widgetId: id,
                path,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "pageId", "name", "path"],
            properties: {
                kind: { type: "string", enum: ["shared-widget-text"] },
                pageId: id,
                name: { type: "string", minLength: 1, maxLength: 80 },
                path,
            },
            description:
                "Header/footer text lives on the site, so the edit shows on every page; pageId records where it was made.",
        },
    ],
};
export const textEdit = {
    type: "object",
    description:
        "One applied inline edit: editId, target, widgetName, exact before/after, userId, at, the page/site revision it produced, and undoOf when it reverses another edit. Rows are append-only.",
};
export const textEditPaths = {
    "/api/content-changes/text/leaves": {
        get: {
            tags: ["Content changes"],
            summary: "Inline-editable text on a page",
            description:
                "Every visible string a site manager may edit in place: each non-shared block's stored settings plus its defaults for unset fields, and the shared header/footer. Addresses, identities, image sources and presentation keys are never listed. Requires site:manage outside Member Mimic.",
            security: session,
            parameters: [
                { name: "pageId", in: "query", required: true, schema: id },
            ],
            responses: {
                200: json({
                    type: "object",
                    properties: {
                        pageId: id,
                        revision: { type: "integer" },
                        widgets: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    widgetId: id,
                                    name: { type: "string" },
                                    shared: { type: "boolean" },
                                    leaves: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                path,
                                                value: text,
                                                kind: {
                                                    type: "string",
                                                    enum: [
                                                        "text",
                                                        "rich-text-leaf",
                                                    ],
                                                },
                                                source: {
                                                    type: "string",
                                                    enum: [
                                                        "settings",
                                                        "default",
                                                    ],
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                }),
                403: { description: "Not a site manager, or in Member Mimic." },
                404: { description: "Page not found in this site." },
            },
        },
    },
    "/api/content-changes/text/edit": {
        post: {
            tags: ["Content changes"],
            summary: "Apply one inline text edit",
            description:
                "Replaces one text leaf immediately on the published page and mirrors it into an existing draft of the same text. `before` must equal the stored value; otherwise 409 returns the current text. A draft that already changes the text, an emptied string, a changed link word or a control character is refused. Every attempt is recorded; applied edits form the page's history. Same-origin JSON only.",
            security: session,
            requestBody: {
                required: true,
                ...json({
                    type: "object",
                    additionalProperties: false,
                    required: ["target", "before", "after"],
                    properties: {
                        target: textEditTarget,
                        before: text,
                        after: text,
                        undoOf: {
                            type: "string",
                            format: "uuid",
                            description:
                                "The edit this one reverses (undo, redo, or a restore from history).",
                        },
                    },
                }),
            },
            responses: {
                200: json({
                    type: "object",
                    properties: {
                        kind: { type: "string", enum: ["applied"] },
                        edit: textEdit,
                    },
                }),
                400: {
                    description:
                        "Unsupported field, empty text, or invalid input.",
                },
                403: {
                    description:
                        "Not a site manager, wrong origin, or Member Mimic.",
                },
                409: {
                    description:
                        "Stale (`current` carries the stored text), a conflicting unpublished draft, or the page changed while saving.",
                },
                429: { description: "Rate limited." },
            },
        },
    },
    "/api/content-changes/text/history": {
        get: {
            tags: ["Content changes"],
            summary: "Inline text edit history for a page",
            description:
                "Applied edits on this page plus every site-wide header/footer edit, newest first, 50 per page with `before` as the cursor.",
            security: session,
            parameters: [
                { name: "pageId", in: "query", required: true, schema: id },
                {
                    name: "before",
                    in: "query",
                    required: false,
                    schema: { type: "string", format: "date-time" },
                },
            ],
            responses: {
                200: json({
                    type: "object",
                    properties: {
                        edits: { type: "array", items: textEdit },
                        nextCursor: { type: ["string", "null"] },
                    },
                }),
            },
        },
    },
};
