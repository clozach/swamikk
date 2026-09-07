import type { NextRequest } from "next/server";
import {
    apiResponse,
    requestContext,
    readBoundedJson,
    requireSameOrigin,
    limitRequest,
} from "@/services/content-changes/http";
import { requireNoMimic } from "@/services/drip-admin/guard";
import { dripId } from "@/services/drip-admin/validation";
import {
    readPublicationCandidates,
    observePublications,
} from "@/services/publication-observations/service";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        requireNoMimic(req.headers);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "publication-observation-read", 60);
        return readPublicationCandidates(
            dripId.parse(req.nextUrl.searchParams.get("courseId")),
            ctx,
            req.nextUrl.searchParams.get("cursor")
                ? dripId.parse(req.nextUrl.searchParams.get("cursor"))
                : undefined,
        );
    });
}
export async function POST(req: NextRequest) {
    return apiResponse(async () => {
        requireNoMimic(req.headers);
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "publication-observation-write", 10);
        return observePublications(await readBoundedJson(req, 16 * 1024), ctx);
    });
}
