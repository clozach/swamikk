import { z } from "zod";

export const dripId = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/);
const version = z.number().int().min(1);
export const dripPatchSchema = z
    .object({
        groupId: dripId,
        rule: z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("available") }).strict(),
            z
                .object({
                    kind: z.literal("exact"),
                    at: z
                        .string()
                        .datetime({ offset: true })
                        .transform((value) => new Date(value).toISOString()),
                })
                .strict(),
            z
                .object({
                    kind: z.literal("relative"),
                    delayInMillis: z
                        .number()
                        .int()
                        .min(0)
                        .max(10 * 365 * 86400000),
                })
                .strict(),
        ]),
        groupOrder: z.array(dripId).min(1).max(500),
        notificationEnabled: z.boolean(),
    })
    .strict();
export const dripCreateSchema = z
    .object({ courseId: dripId, patch: dripPatchSchema })
    .strict();
export const dripActionSchema = z.discriminatedUnion("action", [
    z
        .object({
            action: z.literal("approve"),
            version,
            previewHash: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    z
        .object({
            action: z.literal("refresh"),
            version,
            patch: dripPatchSchema.optional(),
        })
        .strict(),
    z.object({ action: z.literal("discard"), version }).strict(),
    z.object({ action: z.literal("restore"), version }).strict(),
    z.object({ action: z.literal("reconcile") }).strict(),
]);
