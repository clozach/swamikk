import type { NextRequest } from "next/server";
import {
    apiResponse,
    requestContext,
    requireFeedbackAdmin,
} from "../content-changes/http";
import { requireCondition } from "../content-changes/errors";
import { hasMemberMimicCookie } from "../member-mimic/constants";

export async function meetingContext(req: NextRequest) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host") || new URL(req.url).host;
    const protocol =
        req.headers.get("x-forwarded-proto") ||
        new URL(req.url).protocol.replace(":", "");
    requireCondition(
        req.headers.get("sec-fetch-site") !== "cross-site" &&
            (!origin || origin === `${protocol}://${host}`),
        "forbidden",
        "Open meeting questions from this site.",
        403,
    );
    requireCondition(
        !hasMemberMimicCookie(req.headers),
        "mimic_read_only",
        "Exit Member Mimic before opening meeting questions.",
        403,
    );
    const ctx = await requestContext(req);
    requireCondition(
        ctx.user?.active &&
            String(ctx.user.domain) === String(ctx.subdomain._id),
        "forbidden",
        "Sign in as a site administrator to open meeting questions.",
        403,
    );
    requireFeedbackAdmin(ctx);
    return ctx;
}

export async function meetingResponse(operation: () => Promise<unknown>) {
    const response = await apiResponse(operation);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
