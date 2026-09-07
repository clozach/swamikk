import { NextRequest } from "next/server";
import {
    limitRequest,
    readBoundedJson,
    requireSameOrigin,
    requestContext,
} from "@/services/content-changes/http";
import { assertNoMemberMimicMutation } from "@/services/member-mimic/context";
import {
    contactReadContext,
    contactResponse,
} from "@/services/contact-preferences/http";
import {
    readContactPreferences,
    saveContactPreferences,
} from "@/services/contact-preferences/service";

export async function GET(req: NextRequest) {
    return contactResponse(async () =>
        readContactPreferences(await contactReadContext(req)),
    );
}

export async function PUT(req: NextRequest) {
    return contactResponse(async () => {
        assertNoMemberMimicMutation(req.headers);
        requireSameOrigin(req);
        const ctx = await requestContext(req);
        await limitRequest(req, ctx, "contact-preferences", 12);
        return saveContactPreferences(
            await readBoundedJson(req, 3 * 1024 * 1024),
            ctx,
        );
    });
}
