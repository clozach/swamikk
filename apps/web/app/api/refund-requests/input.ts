import { z } from "zod";
const id = z.string().min(1).max(128);
const reviewHash = z.string().regex(/^[a-f0-9]{64}$/);
const explanation = z.string().trim().min(1).max(2000);
export const memberRefundInput = z.discriminatedUnion("action", [
    z
        .object({
            action: z.literal("prepare"),
            invoiceId: id,
            reason: explanation,
        })
        .strict(),
    z
        .object({ action: z.literal("submit"), requestId: id, reviewHash })
        .strict(),
    z
        .object({ action: z.literal("reconcile"), requestId: id, reviewHash })
        .strict(),
]);
export const operatorRefundInput = z.discriminatedUnion("action", [
    z
        .object({
            action: z.literal("review"),
            requestId: id,
            amount: z.number().int().positive().safe().optional(),
            newAttempt: z.boolean().optional(),
            reviewHash: reviewHash.optional(),
        })
        .strict(),
    z
        .object({
            action: z.literal("approve"),
            requestId: id,
            reviewHash,
            explanation,
        })
        .strict(),
    z
        .object({
            action: z.literal("decline"),
            requestId: id,
            reviewHash,
            explanation,
        })
        .strict(),
    z
        .object({
            action: z.literal("escalate"),
            requestId: id,
            reviewHash,
            explanation,
        })
        .strict(),
    z
        .object({ action: z.literal("reconcile"), requestId: id, reviewHash })
        .strict(),
    z
        .object({
            action: z.literal("verify-class"),
            invoiceId: id,
            cohortId: id,
            explanation,
            bookingVerified: z.literal(true),
        })
        .strict(),
]);
export const receiptQueryId = id;
