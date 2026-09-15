import type { NextRequest } from "next/server";
import {
    apiResponse,
    limitRequest,
    readBoundedJson,
    requestContext,
    requireSameOrigin,
} from "@/services/content-changes/http";
import { assertNoMemberMimicMutation } from "@/services/member-mimic/context";
import { applySectionEdit } from "@/services/section-edits/apply";
import { pageSections } from "@/services/section-edits/read";
import {
    sectionEditInput,
    sectionsQuery,
} from "@/services/section-edits/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "section-list", 120);
        const query = sectionsQuery.parse(
            Object.fromEntries(req.nextUrl.searchParams),
        );
        return pageSections(query.pageId, ctx);
    });
}

export async function POST(req: NextRequest) {
    return apiResponse(async () => {
        requireSameOrigin(req);
        assertNoMemberMimicMutation(req.headers);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "section-edit", 120);
        return applySectionEdit(
            sectionEditInput.parse(await readBoundedJson(req, 4096)),
            ctx,
        );
    });
}
