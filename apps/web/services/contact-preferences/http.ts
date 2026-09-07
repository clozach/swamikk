import { NextRequest } from "next/server";
import { apiResponse, requestContext } from "@/services/content-changes/http";
import { requireCondition } from "@/services/content-changes/errors";
import { resolveMemberReadContext } from "@/services/member-mimic/context";

export async function contactReadContext(req: NextRequest) {
    const resolution = await resolveMemberReadContext(
        req.headers,
        await requestContext(req),
    );
    requireCondition(
        resolution.kind !== "expired",
        "mimic_expired",
        "Member Mimic has expired. Exit and start again.",
        403,
    );
    return resolution.context;
}

export async function contactResponse(operation: () => Promise<unknown>) {
    const response = await apiResponse(operation);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
