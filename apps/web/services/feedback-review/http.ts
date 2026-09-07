import type { NextRequest } from "next/server";
import { z } from "zod";
import DomainModel from "@/models/Domain";
import { assertNoMemberMimicMutation } from "../member-mimic/context";
import { apiResponse, readBoundedJson } from "../content-changes/http";
import { requireCondition } from "../content-changes/errors";
import { withReviewer, type ReviewerAuthority } from "./authority";
import { safeJson } from "./validation";
export function reviewerResponse<T>(
    req: NextRequest,
    schema: z.ZodType<T>,
    purpose: string,
    operation: (input: T, authority: ReviewerAuthority) => Promise<unknown>,
) {
    return apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        const bearer = /^Bearer (\S{1,180})$/.exec(
            req.headers.get("authorization") || "",
        );
        requireCondition(
            bearer,
            "unauthorized",
            "A restricted review credential is required.",
            401,
        );
        requireCondition(
            req.headers.get("content-type")?.split(";")[0].trim() ===
                "application/json",
            "bad_request",
            "Send a JSON request.",
            415,
        );
        const domain = await DomainModel.findOne({
            name: req.headers.get("domain"),
        });
        requireCondition(
            domain,
            "unauthorized",
            "This review site is unavailable.",
            401,
        );
        const raw = await readBoundedJson(req, 64 * 1024);
        safeJson(raw);
        const input = schema.parse(raw);
        return withReviewer(
            String(domain._id),
            bearer[1],
            purpose,
            (authority) => operation(input, authority),
        );
    }).then((response) => {
        response.headers.set("Cache-Control", "no-store");
        response.headers.set("Vary", "Authorization");
        return response;
    });
}
