const json = (schema) => ({ content: { "application/json": { schema } } });
const id = {
    type: "string",
    minLength: 1,
    maxLength: 128,
    pattern: "^[a-zA-Z0-9_-]+$",
};
const uuid = { type: "string", format: "uuid" };
const hash = { type: "string", pattern: "^[a-f0-9]{64}$" };
const target = {
    type: "object",
    additionalProperties: false,
    required: ["pageId", "documentId", "widgetId"],
    properties: {
        pageId: id,
        documentId: {
            type: "string",
            pattern: "^[a-fA-F0-9]{24}$",
            description: "Immutable native page identity returned by GET.",
        },
        widgetId: id,
    },
};
const widget = {
    type: "object",
    required: ["widgetId", "name", "deleteable", "shared"],
    properties: {
        widgetId: id,
        name: { type: "string" },
        deleteable: { type: "boolean" },
        shared: { type: "boolean" },
        settings: { type: "object", additionalProperties: true },
    },
    description:
        "The full stored WidgetInstance. Omitted settings continue using the current renderer's defaults; the renderer itself is not a historical snapshot.",
};
const edit = {
    type: "object",
    required: [
        "editId",
        "target",
        "action",
        "widgetName",
        "label",
        "widget",
        "position",
        "userId",
        "at",
        "revision",
    ],
    properties: {
        editId: uuid,
        target,
        action: { type: "string", enum: ["remove", "restore"] },
        widgetName: { type: "string" },
        label: { type: "string" },
        widget,
        position: {
            type: "object",
            required: ["beforeId", "afterId", "index"],
            properties: {
                beforeId: { type: "string", nullable: true },
                afterId: { type: "string", nullable: true },
                index: { type: "integer", minimum: 0 },
            },
        },
        userId: id,
        at: { type: "string", format: "date-time" },
        revision: { type: "integer", minimum: 1 },
        undoOf: uuid,
    },
    description:
        "An applied SectionEdit. Undo, redo and History restoration each create a new row; undoOf identifies the row reversed. Internal request hashes, draft snapshots, state and receipts are not returned.",
};
const errors = {
    400: {
        description:
            "Malformed input, invalid cursor, unpublished page, or unsupported/fixed/shared target.",
    },
    401: { description: "The signed-in account is unavailable." },
    403: {
        description:
            "Site-management permission required, wrong Origin, or Member Mimic cookie/context present.",
    },
    404: {
        description: "Page, edit or site unavailable in the current tenant.",
    },
    409: {
        description:
            "stale, draft_conflict, order_conflict, unsettled or idempotency_conflict. The attempted change did not overwrite newer work.",
    },
    429: {
        description:
            "120 requests/minute per actor for this route's action bucket.",
    },
    503: {
        description:
            "Outcome may be unsettled. Retry the same requestId/payload; GET can recover an applied page receipt.",
    },
};
const pageParameter = {
    name: "pageId",
    in: "query",
    required: true,
    schema: id,
};
const common = {
    tags: ["Section Edits"],
    security: [{ CourseLitSession: [] }],
};

export const sectionEditsApiOpenApi = {
    tags: [
        {
            name: "Section Edits",
            description:
                "Direct removal and restoration of complete authored body sections by site managers. Published and matching draft copies change atomically; durable history and media references retain the way back.",
        },
    ],
    paths: {
        "/api/section-edits": {
            get: {
                ...common,
                operationId: "getPageSections",
                summary:
                    "List removable sections and persistent Undo positions",
                description:
                    "Requires an active same-tenant site:manage user, outside Member Mimic. Returns removable nonshared body blocks plus the latest applied removal of every currently absent block, scoped to the page's immutable document identity. Recovers durable page receipts before listing. Cache-Control: no-store; 120/minute.",
                parameters: [pageParameter],
                responses: {
                    200: {
                        description:
                            "PageSections, including removals recoverable after reload.",
                        ...json({
                            type: "object",
                            required: [
                                "pageId",
                                "documentId",
                                "revision",
                                "sections",
                                "removed",
                            ],
                            properties: {
                                pageId: id,
                                documentId: target.properties.documentId,
                                revision: { type: "integer", minimum: 0 },
                                sections: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        required: [
                                            "widgetId",
                                            "widgetName",
                                            "label",
                                            "fingerprint",
                                            "index",
                                        ],
                                        properties: {
                                            widgetId: id,
                                            widgetName: { type: "string" },
                                            label: { type: "string" },
                                            fingerprint: hash,
                                            index: {
                                                type: "integer",
                                                minimum: 0,
                                            },
                                        },
                                    },
                                },
                                removed: { type: "array", items: edit },
                            },
                        }),
                    },
                    ...errors,
                },
            },
            post: {
                ...common,
                operationId: "applySectionEdit",
                summary: "Remove a section or reverse a recorded operation",
                description:
                    "Same-origin JSON, at most 4096 bytes; site:manage, no Member Mimic; 120/minute. remove requires GET's target and widget fingerprint. reverse names an applied edit: removal becomes restoration, restoration becomes removal. A requestId UUID identifies one immutable actor/payload and becomes editId; retries return the original result. The operation is retained before a page compare-and-swap updates layout, matching draft and sectionEditReceipts together. Settlement marks history applied before clearing only that receipt. Restoration preserves stored settings, identity and safe neighboring order; conflicting newer block/draft/order changes are retained and return 409. This does not restore deleted pages or freeze future renderer defaults.",
                requestBody: {
                    required: true,
                    ...json({
                        oneOf: [
                            {
                                type: "object",
                                additionalProperties: false,
                                required: [
                                    "action",
                                    "requestId",
                                    "target",
                                    "fingerprint",
                                ],
                                properties: {
                                    action: {
                                        type: "string",
                                        enum: ["remove"],
                                    },
                                    requestId: uuid,
                                    target,
                                    fingerprint: hash,
                                },
                            },
                            {
                                type: "object",
                                additionalProperties: false,
                                required: ["action", "requestId", "editId"],
                                properties: {
                                    action: {
                                        type: "string",
                                        enum: ["reverse"],
                                    },
                                    requestId: uuid,
                                    editId: uuid,
                                },
                            },
                        ],
                    }),
                },
                responses: {
                    200: {
                        description:
                            "The applied operation, including an idempotent replay.",
                        ...json({
                            type: "object",
                            required: ["kind", "edit"],
                            properties: {
                                kind: { type: "string", enum: ["applied"] },
                                edit,
                            },
                        }),
                    },
                    413: { description: "Body exceeds 4096 bytes." },
                    415: {
                        description: "Content-Type must be application/json.",
                    },
                    ...errors,
                },
            },
        },
        "/api/section-edits/history": {
            get: {
                ...common,
                operationId: "listSectionEdits",
                summary: "Read durable section history",
                description:
                    "Applied edits for the current immutable page document, newest first, 50 per page. Equal timestamps are separated by editId in the opaque cursor. Requires site:manage outside Member Mimic; no-store; 120/minute. A new page at a deleted page's old route does not inherit its history.",
                parameters: [
                    pageParameter,
                    {
                        name: "before",
                        in: "query",
                        required: false,
                        schema: { type: "string", maxLength: 512 },
                        description: "nextCursor from the previous response.",
                    },
                ],
                responses: {
                    200: {
                        description: "SectionEditHistory.",
                        ...json({
                            type: "object",
                            required: ["edits", "nextCursor"],
                            properties: {
                                edits: { type: "array", items: edit },
                                nextCursor: { type: "string", nullable: true },
                            },
                        }),
                    },
                    ...errors,
                },
            },
        },
    },
};
