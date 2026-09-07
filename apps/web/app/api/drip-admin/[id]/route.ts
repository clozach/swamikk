import type { NextRequest } from "next/server";
import {
    apiResponse,
    requestContext,
    requireSameOrigin,
    readBoundedJson,
    limitRequest,
} from "@/services/content-changes/http";
import { requireNoMimic } from "@/services/drip-admin/guard";
import {
    getDripChange,
    dripChangeView,
    approveDripChange,
    refreshDripChange,
    discardDripChange,
    restoreDripChange,
    reconcileDripChange,
} from "@/services/drip-admin/changes";
import { dripActionSchema, dripId } from "@/services/drip-admin/validation";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Params) {
    return apiResponse(async () => {
        requireNoMimic(req.headers);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "drip-read", 120);
        return {
            change: dripChangeView(
                await getDripChange(dripId.parse((await params).id), ctx),
            ),
        };
    });
}
export async function POST(req: NextRequest, { params }: Params) {
    return apiResponse(async () => {
        requireNoMimic(req.headers);
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "drip-action");
        const id = dripId.parse((await params).id);
        const body = dripActionSchema.parse(
            await readBoundedJson(req, 32 * 1024),
        );
        switch (body.action) {
            case "approve":
                return {
                    change: await approveDripChange(
                        id,
                        body.version,
                        body.previewHash,
                        ctx,
                    ),
                };
            case "refresh":
                return {
                    change: await refreshDripChange(
                        id,
                        body.version,
                        body.patch,
                        ctx,
                    ),
                };
            case "discard":
                return {
                    change: await discardDripChange(id, body.version, ctx),
                };
            case "restore":
                return {
                    change: await restoreDripChange(id, body.version, ctx),
                };
            case "reconcile":
                return { change: await reconcileDripChange(id, ctx) };
        }
    });
}
