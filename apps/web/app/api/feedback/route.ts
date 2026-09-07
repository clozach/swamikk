import type { NextRequest } from "next/server";
import {
    apiResponse,
    limitRequest,
    readBoundedJson,
    requestContext,
    requireSameOrigin,
} from "@/services/content-changes/http";
import {
    createFeedback,
    listFeedback,
} from "@/services/content-changes/feedback";
import { feedbackInputSchema } from "@/services/content-changes/validation";
import { nextCursor } from "@/services/content-changes/pagination";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    return apiResponse(async () => {
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "feedback-create", 6);
        const body = feedbackInputSchema.parse(
            await readBoundedJson(req, 20_000),
        );
        return { feedback: await createFeedback(body, ctx) };
    }, 201);
}

export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "feedback-read", 120);
        const feedback = await listFeedback(
            ctx,
            req.nextUrl.searchParams.get("cursor") || undefined,
        );
        return { feedback, nextCursor: nextCursor(feedback) };
    });
}
