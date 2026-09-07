import { NextRequest } from "next/server";
import { feedbackDetail } from "@/services/content-changes/feedback";
import {
    apiResponse,
    requestContext,
    requireFeedbackAdmin,
} from "@/services/content-changes/http";
import { requireCondition } from "@/services/content-changes/errors";
import { getMedia } from "@/services/medialit";

/** Private photo delivery is scoped to a visible feedback record, never an ID alone. */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
    let image: Response | undefined;
    const error = await apiResponse(async () => {
        const ctx = await requestContext(req);
        requireFeedbackAdmin(ctx);
        const { id, mediaId } = await params;
        const { feedback } = await feedbackDetail(id, ctx);
        requireCondition(
            feedback.photoMediaIds.includes(mediaId),
            "not_found",
            "Photo not found.",
            404,
        );
        const media = await getMedia(mediaId).catch(() => null);
        requireCondition(
            media &&
                (media as unknown as { group?: string }).group ===
                    ctx.subdomain.name &&
                media.mimeType?.startsWith("image/"),
            "not_found",
            "Photo not found.",
            404,
        );
        requireCondition(media.file, "not_found", "Photo not found.", 404);
        const upstream = await fetch(media.file, {
            signal: AbortSignal.timeout(30000),
        });
        requireCondition(
            upstream.ok,
            "unavailable",
            "Photo is temporarily unavailable.",
            503,
        );
        image = new Response(upstream.body, {
            headers: {
                "Content-Type": media.mimeType,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Cross-Origin-Resource-Policy": "same-origin",
                "Content-Security-Policy": "sandbox; default-src 'none'",
                "Content-Disposition": "inline",
            },
        });
        return {};
    });
    return image || error;
}
