import { contactPreferencesSchema } from "@/services/contact-preferences/validation";
import {
    readContactPreferences,
    saveContactPreferences,
} from "@/services/contact-preferences/service";
import { assertNoMemberMimicMutation } from "@/services/member-mimic/context";
import {
    limitRequest,
    readBoundedJson,
    requireSameOrigin,
    requestContext,
} from "@/services/content-changes/http";
import { NextRequest } from "next/server";
import {
    contactReadContext,
    contactResponse,
} from "@/services/contact-preferences/http";
import { readContactPhoto } from "@/services/contact-preferences/service";

export async function GET(req: NextRequest) {
    let result: Response | undefined;
    const error = await contactResponse(async () => {
        const photo = await readContactPhoto(
            await contactReadContext(req),
            req.nextUrl.searchParams.get("userId") || undefined,
        );
        result = new Response(new Uint8Array(photo), {
            headers: {
                "Content-Type": "image/jpeg",
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Cross-Origin-Resource-Policy": "same-origin",
                "Content-Security-Policy": "sandbox; default-src 'none'",
                "Content-Disposition": "inline",
            },
        });
        return {};
    });
    return result || error;
}

/** Save a photo immediately without submitting other, possibly unsaved fields. */
export async function PUT(req: NextRequest) {
    return contactResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "contact-photo", 12);
        const input = contactPreferencesSchema
            .pick({ revision: true, photo: true })
            .parse(await readBoundedJson(req, 3 * 1024 * 1024));
        const current = await readContactPreferences(ctx);
        return saveContactPreferences({ ...current, ...input }, ctx);
    });
}
