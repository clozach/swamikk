import type { NextRequest } from "next/server";
import {
    apiResponse,
    requestContext,
    requireSameOrigin,
    readBoundedJson,
    limitRequest,
} from "@/services/content-changes/http";
import { assertNoMemberMimicMutation } from "@/services/member-mimic/context";
import {
    readOperatorRefundRequests,
    refundBookingChoices,
} from "@/services/refund-requests/read";
import { refreshRefundReview } from "@/services/refund-requests/review";
import { decideRefundRequest } from "@/services/refund-requests/actions";
import { applyRefundRequest } from "@/services/refund-requests/apply";
import { verifyRefundClassBooking } from "@/services/refund-requests/booking";
import { operatorRefundInput, receiptQueryId } from "../input";
import { withRefundOperatorWrite } from "@/services/refund-requests/account-write";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "refund-review-read", 60);
        const invoiceId = req.nextUrl.searchParams.get("invoiceId");
        return invoiceId
            ? refundBookingChoices(ctx, receiptQueryId.parse(invoiceId))
            : readOperatorRefundRequests(ctx);
    });
}
export async function POST(req: NextRequest) {
    return apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "refund-review-write", 20);
        const input = operatorRefundInput.parse(
            await readBoundedJson(req, 4096),
        );
        return withRefundOperatorWrite(ctx, input, async () => {
            if (input.action === "verify-class")
                return verifyRefundClassBooking(ctx, input);
            if (input.action === "review")
                return refreshRefundReview(
                    ctx,
                    input.requestId,
                    true,
                    undefined,
                    input,
                );
            if (input.action === "reconcile")
                return applyRefundRequest(
                    ctx,
                    input.requestId,
                    true,
                    undefined,
                    input.reviewHash,
                );
            return decideRefundRequest(ctx, input);
        });
    });
}
