import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertNoMemberMimicMutation } from "@/services/member-mimic/context";
import {
    apiResponse,
    requestContext,
    requireSameOrigin,
    readBoundedJson,
    limitRequest,
} from "@/services/content-changes/http";
import { revokeGrant } from "@/services/feedback-review/grants";
import { safeJson } from "@/services/feedback-review/validation";
export const dynamic = "force-dynamic";
export const POST = (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) =>
    apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        requireSameOrigin(req);
        const raw = await readBoundedJson(req, 4096);
        safeJson(raw);
        z.object({ action: z.literal("revoke") })
            .strict()
            .parse(raw);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "feedback-review-revoke", 20);
        return revokeGrant((await params).id, ctx);
    });
