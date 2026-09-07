import type { NextRequest } from "next/server";
import { z } from "zod";
import { reviewerResponse } from "@/services/feedback-review/http";
import { claimReview } from "@/services/feedback-review/claim";
export const dynamic = "force-dynamic";
export const POST = (req: NextRequest) =>
    reviewerResponse(req, z.object({}).strict(), "claim", (_input, authority) =>
        claimReview(authority),
    );
