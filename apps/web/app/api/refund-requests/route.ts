import type { NextRequest } from "next/server";
import {
    apiResponse,
    requestContext,
    requireSameOrigin,
    readBoundedJson,
    limitRequest,
} from "@/services/content-changes/http";
import { requireCondition } from "@/services/content-changes/errors";
import {
    assertNoMemberMimicMutation,
    resolveMemberReadContext,
} from "@/services/member-mimic/context";
import { readMemberRefundRequests } from "@/services/refund-requests/read";
import { prepareRefundRequest } from "@/services/refund-requests/review";
import { submitRefundRequest } from "@/services/refund-requests/actions";
import { applyRefundRequest } from "@/services/refund-requests/apply";
import { memberRefundInput } from "./input";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        const resolved = await resolveMemberReadContext(
            req.headers,
            await requestContext(req),
        );
        requireCondition(
            resolved.kind !== "expired",
            "mimic_expired",
            "Member Mimic has ended. Return to administration.",
            403,
        );
        await limitRequest(req, resolved.context, "refund-requests-read", 60);
        return readMemberRefundRequests(resolved.context);
    });
}
export async function POST(req: NextRequest) {
    return apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "refund-requests-write", 20);
        const input = memberRefundInput.parse(await readBoundedJson(req, 4096));
        if (input.action === "prepare") return prepareRefundRequest(ctx, input);
        if (input.action === "submit") return submitRefundRequest(ctx, input);
        return applyRefundRequest(
            ctx,
            input.requestId,
            false,
            undefined,
            input.reviewHash,
        );
    });
}
