import { NextRequest } from "next/server";
import { z } from "zod";
import Domain from "@/models/Domain";
import { apiResponse } from "@/services/content-changes/http";
import { requireCondition } from "@/services/content-changes/errors";
import { classChoices } from "@/services/class-checkout/choices";

/** Anonymous public offer data only. Never returns a roster, booking, user or provider identifier. */
export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        const input = z
            .object({
                courseId: z.string().min(1).max(100),
                planId: z.string().min(1).max(100),
            })
            .strict()
            .parse(Object.fromEntries(new URL(req.url).searchParams));
        const domain = await Domain.findOne({ name: req.headers.get("domain") })
            .select("_id")
            .lean();
        requireCondition(domain, "not_found", "Site not found.", 404);
        return classChoices(String(domain._id), input.courseId, input.planId);
    });
}
