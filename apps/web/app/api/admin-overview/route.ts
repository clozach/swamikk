import type { NextRequest } from "next/server";
import { z } from "zod";
import {
    apiResponse,
    limitRequest,
    requestContext,
} from "@/services/content-changes/http";
import { requireOverviewActor } from "@/services/admin-overview/guard";
import { readAdminOverview } from "@/services/admin-overview/read";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        const ctx = await requestContext(req);
        requireOverviewActor(ctx, req.headers);
        await limitRequest(req, ctx, "admin-overview-read", 30);
        const days = z
            .enum(["7", "30"])
            .parse(req.nextUrl.searchParams.get("days") || "7");
        return readAdminOverview(ctx, days === "30" ? 30 : 7);
    });
}
