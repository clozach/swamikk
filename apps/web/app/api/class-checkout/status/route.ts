import { NextRequest } from "next/server";
import { z } from "zod";
import { apiResponse, requestContext } from "@/services/content-changes/http";
import { requireCondition } from "@/services/content-changes/errors";
import { assertNoMemberMimicMutation } from "@/services/member-mimic/context";
import { classCheckoutStatus } from "@/services/class-checkout/status";

export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        const input = z
            .object({ courseId: z.string().min(1).max(100) })
            .strict()
            .parse(Object.fromEntries(new URL(req.url).searchParams));
        const ctx = await requestContext(req);
        requireCondition(
            ctx.user,
            "unauthorized",
            "Sign in to check your checkout.",
            401,
        );
        return classCheckoutStatus(
            String(ctx.subdomain._id),
            ctx.user.userId,
            input.courseId,
        );
    });
}
