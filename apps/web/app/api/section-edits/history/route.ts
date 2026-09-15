import type { NextRequest } from "next/server";
import {
    apiResponse,
    limitRequest,
    requestContext,
} from "@/services/content-changes/http";
import { assertNoMemberMimicMutation } from "@/services/member-mimic/context";
import { sectionEditHistory } from "@/services/section-edits/read";
import { sectionHistoryQuery } from "@/services/section-edits/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "section-history", 120);
        const query = sectionHistoryQuery.parse(
            Object.fromEntries(req.nextUrl.searchParams),
        );
        return sectionEditHistory(query.pageId, ctx, query.before);
    });
}
