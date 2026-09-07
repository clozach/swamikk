import { z } from "zod";
import { dripId } from "../drip-admin/validation";

export const publicationObservationInput = z
    .object({
        courseId: dripId,
        lessonIds: z
            .array(dripId)
            .min(1)
            .max(100)
            .refine(
                (ids) => new Set(ids).size === ids.length,
                "Choose each lesson once.",
            ),
    })
    .strict();
