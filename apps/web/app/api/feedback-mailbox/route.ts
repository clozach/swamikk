import type { NextRequest } from "next/server";
import {
    apiResponse,
    limitRequest,
    readBoundedJson,
    requestContext,
    requireSameOrigin,
} from "@/services/content-changes/http";
import {
    mailboxSettingsView,
    saveMailboxSettings,
} from "@/services/feedback-mailbox/settings";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
    return apiResponse(async () => {
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "mailbox-settings-read", 60);
        return mailboxSettingsView(ctx);
    });
}
export async function POST(req: NextRequest) {
    return apiResponse(async () => {
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "mailbox-settings-write", 10);
        return saveMailboxSettings(await readBoundedJson(req, 2048), ctx);
    });
}
