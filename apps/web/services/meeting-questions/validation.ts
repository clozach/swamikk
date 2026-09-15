import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const title = z.string().trim().min(1).max(240);
const location = z
    .object({
        path: z
            .string()
            .max(500)
            .regex(/^\/(?!\/)[a-zA-Z0-9/_-]*$/),
        componentId: z
            .string()
            .max(200)
            .regex(/^[a-zA-Z0-9_-]{1,200}$/),
        label: title,
    })
    .strict();
const question = z
    .object({
        id,
        number: z.number().int().min(1).max(10000),
        title,
        group: z.enum(["start", "optional", "humanitix"]),
        context: z.string().trim().max(8000),
        candidateGroups: z
            .array(
                z
                    .object({
                        title,
                        options: z
                            .array(
                                z
                                    .object({
                                        label: title,
                                        text: z
                                            .string()
                                            .trim()
                                            .min(1)
                                            .max(4000),
                                    })
                                    .strict(),
                            )
                            .max(12),
                    })
                    .strict(),
            )
            .max(16),
        locations: z.array(location).max(12),
    })
    .strict();
export const questionSetWriteSchema = z
    .object({
        expectedRevision: z.number().int().min(0),
        set: z
            .object({
                id,
                title,
                intro: z.string().trim().max(8000),
                questions: z
                    .array(question)
                    .min(1)
                    .max(80)
                    .superRefine((items, ctx) => {
                        for (const key of ["id", "number"] as const) {
                            if (
                                new Set(items.map((item) => item[key])).size !==
                                items.length
                            )
                                ctx.addIssue({
                                    code: z.ZodIssueCode.custom,
                                    message: `Question ${key} values must be unique.`,
                                });
                        }
                    }),
            })
            .strict(),
    })
    .strict();
export const answerInputSchema = z
    .object({
        setId: id,
        questionId: id,
        text: z.string().max(4000),
        expectedRevision: z.number().int().min(0),
        mutationId: z.string().uuid(),
    })
    .strict();
