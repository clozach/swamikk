import type { NextRequest } from "next/server";
import { reviewerResponse } from "@/services/feedback-review/http";
import { leaseInput } from "@/services/feedback-review/validation";
import { readReviewContext } from "@/services/feedback-review/leases";
export const dynamic = "force-dynamic";
export const POST = (req: NextRequest) =>
    reviewerResponse(req, leaseInput, "context", readReviewContext);
