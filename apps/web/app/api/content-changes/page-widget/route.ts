import type { NextRequest } from "next/server";
import { z } from "zod";
import {
    apiResponse,
    requestContext,
    limitRequest,
} from "@/services/content-changes/http";
import { assertNoMemberMimicMutation } from "@/services/member-mimic/context";
import {
    editablePage,
    selectedPageWidget,
} from "@/services/content-changes/page-adapter";
import { pageWidgetFields } from "@/services/content-changes/page-fields";

export const dynamic = "force-dynamic";
const ids = z
    .object({
        pageId: z
            .string()
            .min(1)
            .max(128)
            .regex(/^[a-zA-Z0-9_-]+$/),
        widgetId: z
            .string()
            .min(1)
            .max(128)
            .regex(/^[a-zA-Z0-9_-]+$/),
    })
    .strict();
export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "page-widget-read", 60);
        const target = ids.parse(Object.fromEntries(req.nextUrl.searchParams));
        const page = await editablePage(target.pageId, ctx);
        const widget = selectedPageWidget(page, target.widgetId);
        return {
            target: { kind: "page-widget", ...target },
            widgetName: widget.name,
            fields: pageWidgetFields(widget),
        };
    });
}
