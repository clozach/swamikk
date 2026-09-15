import { z } from "zod";

export const sectionId = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/);
export const sectionEditInput = z.discriminatedUnion("action", [
    z
        .object({
            action: z.literal("remove"),
            requestId: z.string().uuid(),
            target: z
                .object({
                    pageId: sectionId,
                    documentId: z.string().regex(/^[a-fA-F0-9]{24}$/),
                    widgetId: sectionId,
                })
                .strict(),
            fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    z
        .object({
            action: z.literal("reverse"),
            requestId: z.string().uuid(),
            editId: z.string().uuid(),
        })
        .strict(),
]);
export const sectionsQuery = z.object({ pageId: sectionId }).strict();
export const sectionHistoryQuery = sectionsQuery.extend({
    before: z.string().max(512).optional(),
});
