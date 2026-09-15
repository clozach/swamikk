import { z } from "zod";
import type {
    MemberEditChange,
    MemberEditInput,
    MemberEmailInput,
} from "@courselit/common-models";
import { MEMBER_EDIT_FIELDS } from "@courselit/common-models";
import { sanitizeEmail } from "@/lib/sanitize-email";
import { requireCondition } from "@/services/content-changes/errors";
import { contactPreferencesSchema } from "@/services/contact-preferences/validation";
import type { MemberRecordValues } from "./snapshot";

const NAME_MAX = 200;
const ADDRESS_MAX = 254;
const CONTACT_KINDS = ["email", "voice", "text"] as const;
const CHECK_INS = ["none", "occasional"] as const;

const change = z
    .object({
        field: z.enum(
            MEMBER_EDIT_FIELDS as [
                (typeof MEMBER_EDIT_FIELDS)[number],
                ...(typeof MEMBER_EDIT_FIELDS)[number][],
            ],
        ),
        before: z.string().max(ADDRESS_MAX),
        after: z.string().max(ADDRESS_MAX),
    })
    .strict()
    .superRefine((item, ctx) => {
        if (
            item.field === "name" &&
            (item.before.length > NAME_MAX || item.after.length > NAME_MAX)
        )
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `A name is at most ${NAME_MAX} characters.`,
            });
        if (
            item.field === "contact.kind" &&
            !CONTACT_KINDS.includes(item.after as never)
        )
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Preferred contact is email, voice or text.",
            });
        if (
            item.field === "checkIns" &&
            !CHECK_INS.includes(item.after as never)
        )
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Check-ins are none or occasional.",
            });
    });

export const memberEditInputSchema = z
    .object({
        changes: z.array(change).min(1).max(3),
        undoOf: z.string().uuid().optional(),
    })
    .strict()
    .superRefine((input, ctx) => {
        const fields = input.changes.map((item) => item.field);
        if (new Set(fields).size !== fields.length)
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Each field appears once in an edit.",
            });
        if (fields.includes("email") && fields.length > 1)
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "A sign-in email change is saved on its own.",
            });
        if (fields.includes("name") && fields.length > 1)
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "A name change is saved on its own.",
            });
    });

const code = z.string().regex(/^[0-9]{6}$/, "Enter the six-digit code.");
const pendingId = z.string().uuid();
export const memberEmailInputSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("confirm"), pendingId, code }).strict(),
    z.object({ action: z.literal("resend"), pendingId }).strict(),
    z.object({ action: z.literal("cancel"), pendingId }).strict(),
]);

/** `after` is stored as typed, minus the whitespace the record would drop; an address is lower-cased. */
function normaliseAfter(item: MemberEditChange): MemberEditChange {
    if (item.field === "email")
        return { ...item, after: sanitizeEmail(item.after) };
    if (item.field === "name" || item.field === "contact.value")
        return { ...item, after: item.after.trim() };
    return item;
}

export function parseMemberEditInput(raw: unknown): MemberEditInput {
    const input = memberEditInputSchema.parse(raw);
    // History restoration uses the stored bytes (including legacy whitespace).
    return {
        ...input,
        changes: input.undoOf
            ? input.changes
            : input.changes.map(normaliseAfter),
    };
}

export function parseMemberEmailInput(raw: unknown): MemberEmailInput {
    return memberEmailInputSchema.parse(raw);
}

/**
 * The record as it would read after the edit must be valid as a whole: a
 * name that is not blank, and a preferred contact whose kind and value agree
 * (an email-shaped value for email, a phone-shaped one for voice and text) —
 * the same rules the member's own preferences form enforces.
 */
export function assertResultingRecord(
    current: MemberRecordValues,
    changes: MemberEditChange[],
    restoredChanges?: MemberEditChange[],
) {
    const after = (field: MemberEditChange["field"]) =>
        changes.find((item) => item.field === field)?.after ?? current[field];
    if (changes.some((item) => item.field === "name"))
        requireCondition(
            after("name").length > 0 ||
                restoredChanges?.some(
                    (change) => change.field === "name" && change.before === "",
                ),
            "bad_request",
            "Enter a name.",
        );
    if (changes.some((item) => item.field.startsWith("contact.")))
        contactPreferencesSchema.shape.contact.parse({
            kind: after("contact.kind"),
            value: after("contact.value"),
        });
    if (changes.some((item) => item.field === "email"))
        requireCondition(
            z.string().email().max(ADDRESS_MAX).safeParse(after("email"))
                .success,
            "bad_request",
            "Enter a valid sign-in email.",
        );
}
