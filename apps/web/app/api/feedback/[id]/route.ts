import type { NextRequest } from "next/server";
import type { FeedbackRouteParams } from "@courselit/common-models";
import {
    apiResponse,
    limitRequest,
    readBoundedJson,
    requestContext,
    requireSameOrigin,
} from "@/services/content-changes/http";
import {
    deleteFeedback,
    feedbackDetail,
    setFeedbackState,
} from "@/services/content-changes/feedback";
import { feedbackActionSchema } from "@/services/content-changes/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: FeedbackRouteParams) {
    return apiResponse(async () => {
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "feedback-read", 120);
        return feedbackDetail((await params).id, ctx);
    });
}

export async function POST(req: NextRequest, { params }: FeedbackRouteParams) {
    return apiResponse(async () => {
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "feedback-update");
        const body = feedbackActionSchema.parse(
            await readBoundedJson(req, 1024),
        );
        return {
            feedback: await setFeedbackState(
                (await params).id,
                body.action,
                ctx,
            ),
        };
    });
}

export async function DELETE(
    req: NextRequest,
    { params }: FeedbackRouteParams,
) {
    return apiResponse(async () => {
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "feedback-delete");
        return deleteFeedback((await params).id, ctx);
    });
}
