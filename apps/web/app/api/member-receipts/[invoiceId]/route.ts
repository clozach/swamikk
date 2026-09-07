import type { NextRequest } from "next/server";
import { z } from "zod";
import {
    apiResponse,
    limitRequest,
    requestContext,
} from "@/services/content-changes/http";
import { requireCondition } from "@/services/content-changes/errors";
import { resolveMemberReadContext } from "@/services/member-mimic/context";
import { readMemberReceipt } from "@/services/member-receipts/read";
export const dynamic = "force-dynamic";
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ invoiceId: string }> },
) {
    return apiResponse(async () => {
        const actor = await requestContext(req);
        const resolution = await resolveMemberReadContext(req.headers, actor);
        requireCondition(
            resolution.kind !== "expired",
            "mimic_expired",
            "Member Mimic has ended. Return to administration.",
            403,
        );
        await limitRequest(req, resolution.context, "member-receipt-read", 60);
        const { invoiceId } = await params;
        return readMemberReceipt(
            resolution.context,
            z
                .string()
                .regex(/^[A-Za-z0-9_-]{1,128}$/)
                .parse(invoiceId),
        );
    });
}
