const json = (schema) => ({ content: { "application/json": { schema } } });
const session = [{ CourseLitSession: [] }];
const field = {
    type: "string",
    enum: ["name", "email", "contact.kind", "contact.value", "checkIns"],
};
const value = { type: "string", maxLength: 254 };
const change = {
    type: "object",
    additionalProperties: false,
    required: ["field", "before", "after"],
    properties: { field, before: value, after: value },
    description:
        "One field replaced whole. `before` is the exact stored value (name at most 200 characters; contact.kind is email|voice|text; checkIns is none|occasional). New `after` values are trimmed; an email is lower-cased. A validated history restoration preserves the recorded bytes, including a legacy blank or whitespace-containing name.",
};
const editor = {
    type: "object",
    required: ["userId", "name", "email"],
    properties: {
        userId: { type: "string" },
        name: { type: "string" },
        email: { type: "string", format: "email" },
    },
    description:
        "Resolved from the users collection on read; never stored on the row.",
};
const edit = {
    type: "object",
    required: [
        "editId",
        "subjectUserId",
        "editorUserId",
        "mimicId",
        "at",
        "changes",
    ],
    properties: {
        editId: { type: "string", format: "uuid" },
        subjectUserId: { type: "string" },
        editorUserId: { type: "string" },
        editor,
        mimicId: { type: "string" },
        at: { type: "string", format: "date-time" },
        changes: { type: "array", minItems: 1, maxItems: 3, items: change },
        undoOf: { type: "string", format: "uuid" },
        emailVerification: {
            type: "object",
            required: ["kind"],
            properties: {
                kind: {
                    type: "string",
                    enum: ["code-to-new-address", "previously-held"],
                },
            },
        },
        emailEffects: {
            type: "string",
            enum: ["pending", "complete"],
            description:
                "Applied email changes only. Complete means the member's sessions were revoked and the mail service accepted the old-address notice; it does not establish inbox delivery.",
        },
    },
    description:
        "One applied edit made from Member Mimic, recorded as the admin. Original editor, subject, time and before/after values remain fixed while lifecycle and delivery fields settle. Code hash, salt, attempts and state are never returned.",
};
const pending = {
    type: "object",
    required: ["pendingId", "email", "expiresAt"],
    properties: {
        pendingId: { type: "string", format: "uuid" },
        email: { type: "string", format: "email" },
        expiresAt: { type: "string", format: "date-time" },
        undoOf: { type: "string", format: "uuid" },
    },
    description:
        "An email change waiting for its code. Never carries the code.",
};
const snapshot = {
    type: "object",
    required: ["subject", "contact", "actor"],
    properties: {
        subject: {
            type: "object",
            required: ["userId", "name", "email"],
            properties: {
                userId: { type: "string" },
                name: { type: "string" },
                email: { type: "string", format: "email" },
            },
        },
        contact: {
            type: "object",
            required: ["kind", "value", "checkIns", "revision"],
            properties: {
                kind: { type: "string", enum: ["email", "voice", "text"] },
                value: { type: "string" },
                checkIns: { type: "string", enum: ["none", "occasional"] },
                revision: {
                    type: "integer",
                    minimum: 0,
                    description:
                        "0 when the member has no stored preferences yet (defaults shown).",
                },
            },
        },
        emailLock: {
            type: "string",
            enum: ["self", "owner"],
            description:
                "Present when the sign-in email cannot be changed: the admin's own account, or the site owner's.",
        },
        actor: {
            type: "object",
            required: ["userId", "name", "canReviewRefunds"],
            properties: {
                userId: { type: "string" },
                name: { type: "string" },
                canReviewRefunds: { type: "boolean" },
            },
        },
        pendingEmail: pending,
        emailEffects: {
            type: "string",
            enum: ["pending"],
            description:
                "An applied email change still has session-revocation or notice work awaiting retry. Reading the panel again retries retained work.",
        },
    },
    description:
        "Everything the edit panel shows, read fresh from the database.",
};
const applied = {
    type: "object",
    required: ["kind", "edit", "snapshot"],
    properties: {
        kind: { type: "string", enum: ["applied"] },
        edit,
        snapshot,
    },
};
const errors = {
    400: {
        description:
            "Invalid input: a bad field, more than three changes, a repeated field, a name or email change mixed with another field, a new blank name, a contact value that does not fit its kind, a restoration that differs from its recorded previous values, or nothing that differs (`no_change`).",
    },
    403: {
        description:
            "No Member Mimic view (`forbidden`), an expired one (`mimic_expired`), wrong Origin, or an email change on the admin's own or the site owner's account.",
    },
    404: {
        description:
            "Site or member unavailable, or `undoOf` is not an applied edit of this member (`not_found`).",
    },
    429: { description: "Rate limited (per admin)." },
    503: {
        description:
            "The request could not be completed. The record may already be saved; refresh the snapshot to recover its retained history receipt and retry pending email effects before attempting another edit.",
    },
};
export const memberEditsApiOpenApi = {
    tags: [
        {
            name: "Member Edits",
            description:
                "Editing a member's record from Member Mimic. Every applied edit, undo and restore retains a row recorded as the admin. A never-held sign-in address needs its emailed code; a previously held address needs no code but must still be available. Snapshot, History and mutation requests recover outstanding record receipts first.",
        },
    ],
    paths: {
        "/api/member-edits": {
            get: {
                tags: ["Member Edits"],
                operationId: "getMemberEditSnapshot",
                summary: "The member's editable record, fresh",
                security: session,
                description:
                    "Requires an active Member Mimic view (cookie) held by an admin with user:manage. Recovers outstanding record receipts and retries pending email effects, then returns the member's name, sign-in email, preferred contact and check-ins, any email lock, the admin's identity, pending code request and pending email-effect status. Limited to 60/minute per admin.",
                responses: {
                    200: json({
                        type: "object",
                        required: ["snapshot"],
                        properties: { snapshot },
                    }),
                    ...errors,
                },
            },
            post: {
                tags: ["Member Edits"],
                operationId: "applyMemberEdit",
                summary: "Apply one edit to the member",
                security: session,
                description:
                    "Same-origin JSON. One record family per edit: name alone, email alone, or up to three contact/check-in fields. Each `before` must match the stored value; a mismatch returns 409 `stale` with current values before creating this edit. An applying history row precedes an atomic source write of the changed values and its private recovery receipt. User writes leave Last active unchanged; contact writes compare the preference revision. History settles applied before the receipt is removed. A later snapshot, History read or mutation recovers interrupted writes. `undoOf` must name this member's applied row, with matching fields and recorded previous values. A never-held email returns `verify` after sending its six-digit code; a previously held, available address applies directly. Email effects remain pending until sessions are revoked and the mail service accepts the old-address notice. Retrying an interrupted enqueue may send a duplicate notice with the same Message-ID. Bodies: 8 KB; rate: 60/minute per admin.",
                requestBody: {
                    required: true,
                    ...json({
                        type: "object",
                        additionalProperties: false,
                        required: ["changes"],
                        properties: {
                            changes: {
                                type: "array",
                                minItems: 1,
                                maxItems: 3,
                                items: change,
                            },
                            undoOf: { type: "string", format: "uuid" },
                        },
                    }),
                },
                responses: {
                    200: json({
                        oneOf: [
                            applied,
                            {
                                type: "object",
                                required: ["kind", "pending", "snapshot"],
                                properties: {
                                    kind: {
                                        type: "string",
                                        enum: ["verify"],
                                    },
                                    pending,
                                    snapshot,
                                },
                            },
                        ],
                    }),
                    409: {
                        description:
                            "`stale`: body carries `error {code, message}` and `current [{field, value}]`; `conflict`: the address belongs to another account; `unsettled`: a history transition needs a fresh read; or the record changed while saving.",
                        ...json({
                            type: "object",
                            properties: {
                                error: {
                                    type: "object",
                                    properties: {
                                        code: { type: "string" },
                                        message: { type: "string" },
                                    },
                                },
                                current: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            field,
                                            value: { type: "string" },
                                        },
                                    },
                                },
                            },
                        }),
                    },
                    ...errors,
                },
            },
        },
        "/api/member-edits/history": {
            get: {
                tags: ["Member Edits"],
                operationId: "listMemberEdits",
                summary: "Every applied edit of the member",
                security: session,
                description:
                    "Recovers outstanding source receipts before listing applied rows newest first, 50 per page, with a tie-broken opaque cursor in `before`. Each row carries its editor's current name and email, resolved on read, and pending/complete status for email follow-up effects when applicable. Requires an active Member Mimic view. 60/minute per admin.",
                parameters: [
                    {
                        name: "before",
                        in: "query",
                        required: false,
                        schema: { type: "string", maxLength: 512 },
                        description: "The `nextCursor` of the previous page.",
                    },
                ],
                responses: {
                    200: json({
                        type: "object",
                        required: ["edits", "nextCursor"],
                        properties: {
                            edits: { type: "array", items: edit },
                            nextCursor: { type: ["string", "null"] },
                        },
                    }),
                    ...errors,
                },
            },
        },
        "/api/member-edits/email": {
            post: {
                tags: ["Member Edits"],
                operationId: "memberEditEmailStep",
                summary: "Confirm, resend or cancel a sign-in email change",
                security: session,
                description:
                    "Same-origin JSON. `confirm` checks the six-digit code (five attempts, ten minutes): right → the email lands with `emailVerification: code-to-new-address` and Better Auth's emailVerified, followed by session revocation and an old-address notice; wrong → 200 `wrong-code` with `attemptsLeft`; expired or out of attempts → 200 `expired`. A notice failure returns the applied record with emailEffects pending; a session-revocation failure can return 503 after the record and History have saved. Both remain retryable on the next panel read. `resend` mails a fresh code on the same pending change (attempts reset, ten more minutes, at most three resends → 400 `resend_limit`). State and code-generation comparisons reject stale attempts/confirmation/resend requests; a resend invalidates the old code. `cancel` withdraws a pending row. Only this member's pending change initiated by this admin is addressable. 6/minute per admin.",
                requestBody: {
                    required: true,
                    ...json({
                        oneOf: [
                            {
                                type: "object",
                                additionalProperties: false,
                                required: ["action", "pendingId", "code"],
                                properties: {
                                    action: {
                                        type: "string",
                                        enum: ["confirm"],
                                    },
                                    pendingId: {
                                        type: "string",
                                        format: "uuid",
                                    },
                                    code: {
                                        type: "string",
                                        pattern: "^[0-9]{6}$",
                                    },
                                },
                            },
                            {
                                type: "object",
                                additionalProperties: false,
                                required: ["action", "pendingId"],
                                properties: {
                                    action: {
                                        type: "string",
                                        enum: ["resend", "cancel"],
                                    },
                                    pendingId: {
                                        type: "string",
                                        format: "uuid",
                                    },
                                },
                            },
                        ],
                    }),
                },
                responses: {
                    200: json({
                        oneOf: [
                            applied,
                            {
                                type: "object",
                                required: ["kind", "attemptsLeft"],
                                properties: {
                                    kind: {
                                        type: "string",
                                        enum: ["wrong-code"],
                                    },
                                    attemptsLeft: {
                                        type: "integer",
                                        minimum: 1,
                                    },
                                },
                            },
                            {
                                type: "object",
                                required: ["kind", "snapshot"],
                                properties: {
                                    kind: {
                                        type: "string",
                                        enum: ["expired", "cancelled"],
                                    },
                                    snapshot,
                                },
                            },
                            {
                                type: "object",
                                required: ["kind", "pending"],
                                properties: {
                                    kind: {
                                        type: "string",
                                        enum: ["resent"],
                                    },
                                    pending,
                                },
                            },
                        ],
                    }),
                    404: {
                        description:
                            "No email change of this member and admin is waiting for a code (`not_found`).",
                    },
                    409: {
                        description:
                            "The address now belongs to another account (`conflict`), or the member's email changed while saving (`stale`).",
                    },
                    ...errors,
                },
            },
        },
    },
};
