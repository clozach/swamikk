import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * No-JavaScript logout.
 *
 * The header account control and the /logout page sign out in place via JS, but
 * a plain `<form method="post" action="/api/logout">` posts here when scripting
 * is off (the /logout page's form, and the signed-in header's <noscript>
 * fallback). We clear the session and 303-redirect home so a no-JS visitor is
 * never left stranded signed-in — the same trap the in-place flow avoids for
 * everyone else.
 *
 * better-auth's own POST /api/auth/sign-out returns JSON with no redirect, which
 * is why this thin wrapper exists: `asResponse` hands back the session-expiring
 * Set-Cookie headers, and we copy them onto the redirect so the browser
 * actually drops the cookie on its way home.
 */
export async function POST(req: NextRequest) {
    const signOut = await auth.api.signOut({
        headers: req.headers,
        asResponse: true,
    });

    const res = NextResponse.redirect(new URL("/", req.url), { status: 303 });
    for (const cookie of signOut.headers.getSetCookie()) {
        res.headers.append("set-cookie", cookie);
    }
    return res;
}
