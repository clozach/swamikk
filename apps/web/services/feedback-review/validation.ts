import { z } from "zod";
import { ContentChangeError } from "../content-changes/errors";
const id = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[\w-]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const grantInput = z
    .object({
        name: z.string().trim().min(1).max(80),
        scopes: z
            .array(z.enum(["public-page-text", "public-lesson-text"]))
            .min(1)
            .max(2)
            .refine((scopes) => new Set(scopes).size === scopes.length),
        expiresInDays: z.number().int().min(1).max(30),
    })
    .strict();
export const leaseInput = z
    .object({
        feedbackId: id,
        generation: z.number().int().positive(),
        leaseId: id,
        inputHash: hash,
    })
    .strict();
const replacement = z.discriminatedUnion("kind", [
    z
        .object({ kind: z.literal("text"), text: z.string().min(1).max(20000) })
        .strict(),
    z
        .object({
            kind: z.literal("rich-text"),
            content: z
                .object({
                    type: z.literal("doc"),
                    content: z.array(z.record(z.unknown())).max(1000),
                })
                .strict(),
        })
        .strict(),
]);
export const resultInput = leaseInput
    .extend({
        result: z.discriminatedUnion("kind", [
            z
                .object({
                    kind: z.literal("text-proposal"),
                    summary: z.string().trim().min(1).max(2000),
                    replacement,
                })
                .strict(),
            z
                .object({
                    kind: z.literal("escalation"),
                    reason: z.enum([
                        "human-review",
                        "private-or-access",
                        "payment-or-policy",
                        "structure-or-media",
                        "ambiguous-target",
                    ]),
                    summary: z.string().trim().min(1).max(2000),
                })
                .strict(),
        ]),
    })
    .strict();
/** Reject dangerous keys at every depth, including arbitrary rich-text node records. */
export function safeJson(value: unknown): void {
    let count = 0;
    const visit = (item: unknown, depth: number) => {
        if (++count > 20000 || depth > 24)
            throw new ContentChangeError(
                "too_large",
                "Review data is too complex.",
                413,
            );
        if (!item || typeof item !== "object") return;
        const proto = Object.getPrototypeOf(item);
        if (
            !Array.isArray(item) &&
            proto !== Object.prototype &&
            proto !== null
        )
            throw new ContentChangeError(
                "bad_request",
                "Unsupported object type.",
            );
        for (const [key, child] of Object.entries(item)) {
            if (["__proto__", "constructor", "prototype"].includes(key))
                throw new ContentChangeError(
                    "bad_request",
                    "Unsupported object key.",
                );
            visit(child, depth + 1);
        }
    };
    visit(value, 0);
}
