import type { NextRequest } from "next/server";
import { z } from "zod";
import {
    apiResponse,
    requestContext,
    limitRequest,
} from "@/services/content-changes/http";
import { assertNoMemberMimicMutation } from "@/services/member-mimic/context";
import { pageTextLeaves } from "@/services/content-changes/text-edit";

export const dynamic = "force-dynamic";
const query = z
    .object({
        pageId: z
            .string()
            .min(1)
            .max(128)
            .regex(/^[a-zA-Z0-9_-]+$/),
    })
    .strict();

/** Every inline-editable text leaf on a page, for the editor to match against the rendered page. */
export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "text-leaves", 120);
        const { pageId } = query.parse(
            Object.fromEntries(req.nextUrl.searchParams),
        );
        return pageTextLeaves(pageId, ctx);
    });
}
