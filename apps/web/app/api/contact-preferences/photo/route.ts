import { NextRequest } from "next/server";
import {
    contactReadContext,
    contactResponse,
} from "@/services/contact-preferences/http";
import { readContactPhoto } from "@/services/contact-preferences/service";

export async function GET(req: NextRequest) {
    let result: Response | undefined;
    const error = await contactResponse(async () => {
        const photo = await readContactPhoto(await contactReadContext(req));
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
