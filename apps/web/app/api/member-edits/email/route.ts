import type { NextRequest } from "next/server";
import {
    apiResponse,
    limitRequest,
    readBoundedJson,
    requestContext,
    requireSameOrigin,
} from "@/services/content-changes/http";
import { requireMimicEditor } from "@/services/member-edits/context";
import { parseMemberEmailInput } from "@/services/member-edits/validate";
import {
    cancelEmailChange,
    confirmEmailChange,
    resendEmailCode,
} from "@/services/member-edits/email";

export const dynamic = "force-dynamic";

/**
 * The second step of a sign-in email change: confirm the six-digit code sent
 * to the new address, resend it, or cancel. A wrong code and an expired one
 * are 200s with their own `kind`; the panel decides what to say.
 */
export async function POST(req: NextRequest) {
    return apiResponse(async () => {
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "member-edit-email", 6);
        const input = parseMemberEmailInput(await readBoundedJson(req, 2048));
        const editor = await requireMimicEditor(req.headers, ctx);
        if (input.action === "confirm")
            return confirmEmailChange(
                editor,
                req.headers,
                input.pendingId,
                input.code,
            );
        if (input.action === "resend")
            return resendEmailCode(editor, req.headers, input.pendingId);
        return cancelEmailChange(editor, input.pendingId);
    });
}
