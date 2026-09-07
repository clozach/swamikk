import { NextResponse, type NextRequest } from "next/server";
import { getBackendAddress } from "@/app/actions";
import { auth } from "./auth";
import { COURSE_VIEWER_CURRENT_URL_HEADER } from "./lib/course-viewer-session-params";
import {
    hasMemberMimicCookie,
    MEMBER_MIMIC_PATH_HEADER,
} from "./services/member-mimic/constants";

export async function proxy(request: NextRequest) {
    const requestHeaders = request.headers;
    requestHeaders.set(
        MEMBER_MIMIC_PATH_HEADER,
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    // Static framework assets carry the marker too, but do not render a member view.
    if (
        request.nextUrl.pathname.startsWith("/_next/") &&
        ["GET", "HEAD"].includes(request.method)
    ) {
        return NextResponse.next({ request: { headers: requestHeaders } });
    }
    const forwardedProto = request.headers.get("x-forwarded-proto");

    if (!forwardedProto && request.nextUrl.protocol) {
        requestHeaders.set(
            "x-forwarded-proto",
            request.nextUrl.protocol.replace(":", ""),
        );
    }

    if (request.nextUrl.pathname.startsWith("/course/")) {
        requestHeaders.set(
            COURSE_VIEWER_CURRENT_URL_HEADER,
            `${request.nextUrl.pathname}${request.nextUrl.search}`,
        );
    }

    const backend = await getBackendAddress(requestHeaders);

    if (request.nextUrl.pathname === "/healthy") {
        return Response.json({ success: true });
    }

    try {
        const response = await fetch(`${backend}/verify-domain`);

        if (!response.ok) {
            throw new Error();
        }

        const resp = await response.json();

        requestHeaders.set("domain", resp.domain);
        requestHeaders.set("domainId", resp.domainId);
        requestHeaders.set("domainEmail", resp.domainEmail);
        requestHeaders.set("domainTitle", resp.domainTitle || "");
        requestHeaders.set(
            "hideCourseLitBranding",
            resp.hideCourseLitBranding || false,
        );
        if (resp.ssoTrustedDomain) {
            requestHeaders.set("ssoTrustedDomain", resp.ssoTrustedDomain);
        }

        if (
            hasMemberMimicCookie(requestHeaders) &&
            !["GET", "HEAD"].includes(request.method) &&
            !request.nextUrl.pathname.startsWith("/api/")
        ) {
            return Response.json(
                {
                    error: {
                        code: "mimic_read_only",
                        message: "Exit Member Mimic before making changes.",
                    },
                },
                { status: 403, headers: { "Cache-Control": "no-store" } },
            );
        }
        if (
            hasMemberMimicCookie(requestHeaders) &&
            request.nextUrl.pathname.startsWith("/api/")
        ) {
            const path = request.nextUrl.pathname;
            const read = request.method === "GET" || request.method === "HEAD";
            const permitted =
                path === "/api/member-mimic" ||
                (path === "/api/graph" && request.method === "POST") ||
                (read &&
                    ((path.startsWith("/api/media/") &&
                        path !== "/api/media/presigned") ||
                        path === "/api/member-billing" ||
                        path === "/api/config"));
            if (!permitted)
                return Response.json(
                    {
                        error: {
                            code: "mimic_read_only",
                            message:
                                "Exit Member Mimic before using this action or private information.",
                        },
                    },
                    { status: 403, headers: { "Cache-Control": "no-store" } },
                );
        }

        if (request.nextUrl.pathname === "/favicon.ico") {
            try {
                if (resp.logo) {
                    const response = await fetch(resp.logo);
                    if (response.ok) {
                        const blob = await response.blob();
                        return new NextResponse(blob, {
                            headers: {
                                "content-type": "image/webp",
                            },
                        });
                    } else {
                        return NextResponse.rewrite(
                            new URL(`/default-favicon.ico`, request.url),
                        );
                    }
                } else {
                    return NextResponse.rewrite(
                        new URL(`/default-favicon.ico`, request.url),
                    );
                }
            } catch (err) {
                return NextResponse.rewrite(
                    new URL(`/default-favicon.ico`, request.url),
                );
            }
        }

        if (request.nextUrl.pathname.startsWith("/dashboard")) {
            const session = await auth.api.getSession({
                headers: requestHeaders,
            });
            if (!session) {
                return NextResponse.redirect(
                    new URL(
                        `/login?redirect=${encodeURIComponent(
                            request.nextUrl.pathname,
                        )}`,
                        request.url,
                    ),
                );
            }
        }

        return NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });
    } catch (err) {
        return Response.json(
            { success: false, error: err.message },
            { status: 404 },
        );
    }
}

export const config = {
    matcher: [
        "/",
        "/favicon.ico",
        "/api/:path*",
        "/healthy",
        "/course/:path*",
        "/dashboard/:path*",
        { source: "/:path*", has: [{ type: "header", key: "next-action" }] },
        {
            source: "/:path*",
            has: [{ type: "cookie", key: "courselit.member-mimic" }],
        },
    ],
};
