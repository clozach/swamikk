import type { NextRequest } from "next/server";
import {
    apiResponse,
    limitRequest,
    readBoundedJson,
    requestContext,
    requireSameOrigin,
} from "@/services/content-changes/http";
import {
    createChange,
    listChanges,
} from "@/services/content-changes/proposals";
import { contentChangeInputSchema } from "@/services/content-changes/validation";
import { nextCursor } from "@/services/content-changes/pagination";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    return apiResponse(async () => {
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "content-change-create");
        const body = contentChangeInputSchema.parse(await readBoundedJson(req));
        return { change: await createChange(body, ctx) };
    }, 201);
}

export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "content-change-read", 120);
        const changes = await listChanges(
            ctx,
            req.nextUrl.searchParams.get("cursor") || undefined,
        );
        return { changes, nextCursor: nextCursor(changes) };
    });
}
