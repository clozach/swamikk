import type { NextRequest } from "next/server";
import { assertNoMemberMimicMutation } from "@/services/member-mimic/context";
import {
    apiResponse,
    requestContext,
    requireSameOrigin,
    readBoundedJson,
    limitRequest,
} from "@/services/content-changes/http";
import { issueGrant, listGrants } from "@/services/feedback-review/grants";
export const dynamic = "force-dynamic";
export const POST = (req: NextRequest) =>
    apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "feedback-review-grant", 10);
        return issueGrant(await readBoundedJson(req, 4096), ctx);
    }, 201);
export const GET = (req: NextRequest) =>
    apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        return listGrants(await requestContext(req));
    });
