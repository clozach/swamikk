import type { NextRequest } from "next/server";
import { z } from "zod";
import {
    apiResponse,
    requestContext,
    limitRequest,
} from "@/services/content-changes/http";
import { assertNoMemberMimicMutation } from "@/services/member-mimic/context";
import { textEditHistory } from "@/services/content-changes/text-edit";

export const dynamic = "force-dynamic";
const query = z
    .object({
        pageId: z
            .string()
            .min(1)
            .max(128)
            .regex(/^[a-zA-Z0-9_-]+$/),
        before: z.string().datetime().optional(),
    })
    .strict();

/** Applied inline edits for a page (site-wide header/footer edits included), newest first. */
export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "text-history", 60);
        const { pageId, before } = query.parse(
            Object.fromEntries(req.nextUrl.searchParams),
        );
        return textEditHistory(pageId, ctx, before);
    });
}
