import type { NextRequest } from "next/server";
import { z } from "zod";
import {
    apiResponse,
    limitRequest,
    requestContext,
} from "@/services/content-changes/http";
import { listMemberEdits } from "@/services/member-edits/history";

export const dynamic = "force-dynamic";
const query = z
    .object({ before: z.string().min(1).max(512).optional() })
    .strict();

/** Every applied edit of the member, newest first, 50 per page with `before` as the cursor. */
export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "member-edit-history", 60);
        const { before } = query.parse(
            Object.fromEntries(req.nextUrl.searchParams),
        );
        return listMemberEdits(req.headers, ctx, { before });
    });
}
