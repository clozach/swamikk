import { z } from "zod";

export const MailJob = z.object({
    to: z.string().array(),
    from: z.string(),
    subject: z.string(),
    body: z.string(),
    domainId: z.string(),
    headers: z.record(z.string()).optional(),
    account: z
        .object({
            userId: z.string().min(1).max(128),
            actorUserId: z.string().min(1).max(128).optional(),
        })
        .strict()
        .optional(),
    drip: z
        .object({ periodId: z.string().min(1), deliveryId: z.string().min(1) })
        .strict()
        .optional(),
});

export type MailJob = z.infer<typeof MailJob>;
