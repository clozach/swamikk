import type { NextRequest } from "next/server";
import { reviewerResponse } from "@/services/feedback-review/http";
import { resultInput } from "@/services/feedback-review/validation";
import { submitReviewResult } from "@/services/feedback-review/results";
export const dynamic = "force-dynamic";
export const POST = (req: NextRequest) =>
    reviewerResponse(req, resultInput, "result", submitReviewResult);
