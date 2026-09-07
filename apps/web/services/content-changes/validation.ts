import { z } from "zod";

const id = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/);
const path = z
    .string()
    .max(512)
    .regex(/^\/(?!\/)[^?#\x00-\x20]*$/)
    .refine((value) => !value.startsWith("/api/"), "Select a visible page.");

export const feedbackInputSchema = z
    .object({
        text: z.string().trim().min(1).max(4000),
        target: z.discriminatedUnion("kind", [
            z
                .object({
                    kind: z.literal("lesson"),
                    lessonId: id,
                    field: z.enum(["title", "content"]),
                })
                .strict(),
            z
                .object({
                    kind: z.literal("page"),
                    path,
                    componentId: z
                        .string()
                        .trim()
                        .min(1)
                        .max(512)
                        .regex(/^[^\x00-\x1f\x7f]+$/),
                    label: z.string().max(160).optional(),
                })
                .strict(),
        ]),
        photoMediaIds: z.array(id).max(4).optional(),
    })
    .strict();

// This first adapter permits text structure and safe links, not embedded HTML or assets.
// Existing media can be retained verbatim; the adapter checks opaque nodes against baseline.
const content = z
    .object({
        type: z.literal("doc"),
        content: z.array(z.record(z.unknown())).max(1000),
    })
    .strict();
export const lessonPatchSchema = z
    .object({
        title: z.string().trim().min(1).max(240).optional(),
        content: content.optional(),
    })
    .strict()
    .refine(
        (patch) => patch.title !== undefined || patch.content !== undefined,
        "Include a title or text change.",
    );

export const contentChangeInputSchema = z
    .object({
        feedbackId: id.optional(),
        target: z.object({ kind: z.literal("lesson"), lessonId: id }).strict(),
        patch: lessonPatchSchema,
        summary: z.string().trim().min(1).max(2000),
    })
    .strict();

export const contentChangeActionSchema = z.discriminatedUnion("action", [
    z
        .object({
            action: z.literal("revise"),
            version: z.number().int().positive(),
            patch: lessonPatchSchema,
            summary: z.string().trim().min(1).max(2000),
        })
        .strict(),
    z
        .object({
            action: z.literal("approve"),
            version: z.number().int().positive(),
            previewHash: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    z
        .object({
            action: z.literal("reject"),
            version: z.number().int().positive(),
        })
        .strict(),
    z.object({ action: z.literal("reconcile") }).strict(),
    z
        .object({
            action: z.literal("revert"),
            version: z.number().int().positive(),
        })
        .strict(),
]);

export const feedbackActionSchema = z
    .object({ action: z.enum(["close", "reopen"]) })
    .strict();
