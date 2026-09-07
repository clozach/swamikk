import { contactPreferencesCopy as copy } from "@/config/strings";

/** No address/token or remote assets enter this unauthenticated confirmation. */
export function newsletterConfirmationResponse(ok: boolean, status = 200) {
    const title = ok ? copy.unsubscribeTitle : copy.unsubscribeFailedTitle;
    const body = ok ? copy.unsubscribeBody : copy.unsubscribeFailedBody;
    return new Response(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#fbf7ef;color:#3c332a;font:18px/1.65 system-ui}main{max-width:40rem;margin:10vh auto;padding:2rem}h1{font:2.2rem/1.2 Georgia,serif}a{color:inherit;text-underline-offset:.2em}nav{display:flex;gap:2rem;flex-wrap:wrap;margin-top:2rem}nav a{display:inline-flex;align-items:center;min-height:44px}a:focus-visible{outline:3px solid #9a4c20;outline-offset:5px}</style><main><h1>${title}</h1><p>${body}</p><nav><a href="/">${copy.unsubscribeReturn}</a><a href="/p/contact">${copy.unsubscribeHelp}</a></nav></main></html>`,
        {
            status,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
                "Referrer-Policy": "no-referrer",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy":
                    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
            },
        },
    );
}
