import type { NextRequest } from "next/server";
import type { FeedbackRouteParams } from "@courselit/common-models";
import {
    apiResponse,
    limitRequest,
    readBoundedJson,
    requestContext,
    requireSameOrigin,
} from "@/services/content-changes/http";
import { reconcileFeedbackNotification } from "@/services/feedback-mailbox/reconcile";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest, { params }: FeedbackRouteParams) {
    return apiResponse(async () => {
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "mailbox-reconcile", 20);
        return reconcileFeedbackNotification(
            (await params).id,
            await readBoundedJson(req, 1024),
            ctx,
        );
    });
}
