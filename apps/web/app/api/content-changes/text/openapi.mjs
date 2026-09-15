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
const richNode = {
    type: "object",
    required: ["type"],
    properties: { type: { type: "string", enum: ["paragraph", "heading"] } },
    description:
        "A rich-text block node in the stored TipTap shape, replaced whole; proven by the same structure validation as proposals (allowed marks only, embedded material retained).",
};
export const textChange = {
    oneOf: [
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "path", "before", "after"],
            properties: {
                kind: { type: "string", enum: ["text"] },
                path,
                before: text,
                after: text,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "path", "before", "after"],
            properties: {
                kind: { type: "string", enum: ["node"] },
                path,
                before: richNode,
                after: richNode,
            },
        },
    ],
};
export const textEditTarget = {
    oneOf: [
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "pageId", "widgetId"],
            properties: {
                kind: { type: "string", enum: ["page-widget-text"] },
                pageId: id,
                widgetId: id,
            },
        },
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "pageId", "name"],
            properties: {
                kind: { type: "string", enum: ["shared-widget-text"] },
                pageId: id,
                name: { type: "string", minLength: 1, maxLength: 80 },
            },
            description:
                "Header/footer text lives on the site, so the edit shows on every page; pageId records where it was made.",
        },
    ],
};
export const textEdit = {
    type: "object",
    description:
        "One applied inline edit: editId, target, widgetName, changes (each with its exact before/after string or node), userId, at, the page/site revision it produced, and undoOf when it reverses another edit. Rows are append-only.",
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
                200: {
                    description:
                        "Editable text leaves for the page and its shared blocks.",
                    ...json({
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
                                                            "rich-text-node",
                                                        ],
                                                    },
                                                    node: richNode,
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
                },
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
                "Applies one to eight changes on one widget together — string leaves and whole rich-text paragraphs/headings — immediately on the published page, mirrored into an existing draft of the same text. Each `before` must equal the stored value or node; otherwise 409 returns the current values. A draft that already changes the text, an emptied string, removed or lost link words, disallowed formatting or a control character is refused. Every attempt is recorded; applied edits form the page's history. Same-origin JSON only.",
            security: session,
            requestBody: {
                required: true,
                ...json({
                    type: "object",
                    additionalProperties: false,
                    required: ["target", "changes"],
                    properties: {
                        target: textEditTarget,
                        changes: {
                            type: "array",
                            minItems: 1,
                            maxItems: 8,
                            items: textChange,
                        },
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
                200: {
                    description:
                        "The applied text edit and its retained history record.",
                    ...json({
                        type: "object",
                        properties: {
                            kind: { type: "string", enum: ["applied"] },
                            edit: textEdit,
                        },
                    }),
                },
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
                200: {
                    description:
                        "Applied page and shared-text edits with the next history cursor.",
                    ...json({
                        type: "object",
                        properties: {
                            edits: { type: "array", items: textEdit },
                            nextCursor: { type: ["string", "null"] },
                        },
                    }),
                },
            },
        },
    },
};
