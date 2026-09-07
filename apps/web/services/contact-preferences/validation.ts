import { z } from "zod";

const email = z.string().trim().email("Enter a valid contact email.").max(254);
const phone = z
    .string()
    .trim()
    .min(6, "Include your country code and phone number.")
    .max(40)
    .regex(
        /^\+?[0-9 ()-]+$/,
        "Enter a phone number, including its country code.",
    );

export const contactPreferencesSchema = z
    .object({
        revision: z.number().int().nonnegative(),
        contact: z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("email"), value: email }).strict(),
            z.object({ kind: z.literal("voice"), value: phone }).strict(),
            z.object({ kind: z.literal("text"), value: phone }).strict(),
        ]),
        checkIns: z.enum(["none", "occasional"]),
        photo: z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("keep") }).strict(),
            z.object({ kind: z.literal("remove") }).strict(),
            z
                .object({
                    kind: z.literal("replace"),
                    data: z.string().min(1).max(2800000),
                })
                .strict(),
        ]),
    })
    .strict();
