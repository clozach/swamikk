import type { NextRequest } from "next/server";
import {
    apiResponse,
    limitRequest,
    readBoundedJson,
    requestContext,
    requireSameOrigin,
} from "@/services/content-changes/http";
import { requireMimicEditor } from "@/services/member-edits/context";
import { readMemberEditSnapshot } from "@/services/member-edits/snapshot";
import { applyMemberEdit } from "@/services/member-edits/apply";

export const dynamic = "force-dynamic";

/**
 * Everything the edit panel shows, read fresh. The rate limit keys on the
 * signed-in admin (`requestContext` resolves the actor; only the mimic
 * resolution swaps in the member).
 */
export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "member-edit", 60);
        const editor = await requireMimicEditor(req.headers, ctx);
        return { snapshot: await readMemberEditSnapshot(editor) };
    });
}

/**
 * One edit — one to four changes on the member, applied together, recorded
 * as the admin. Each `before` must be the stored value; a mismatch answers
 * 409 with the current values so the panel can resync instead of
 * overwriting. An email change to a never-held address answers `verify`.
 */
export async function POST(req: NextRequest) {
    let staleBody: unknown;
    const response = await apiResponse(async () => {
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "member-edit", 60);
        const body = await readBoundedJson(req, 8192);
        const result = await applyMemberEdit(req.headers, ctx, body);
        if (result.kind === "stale")
            staleBody = {
                error: { code: "stale", message: result.message },
                current: result.current,
            };
        return result;
    });
    if (staleBody)
        return Response.json(staleBody, {
            status: 409,
            headers: { "Cache-Control": "no-store" },
        });
    return response;
}
