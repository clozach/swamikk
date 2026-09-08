import { NextRequest } from "next/server";
import { getCachedDomain } from "@/lib/domain-cache";
import { getCurrentPoolPhoto } from "@/lib/social-hero/pool";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

/**
 * Image proxy for network photos whose upstream (CDN) URLs expire. The client
 * loads `/api/social-hero/img/<photoId>`; we stream the bytes from the
 * upstream URL recorded for that photo in the server-side pool cache.
 *
 * SSRF-safe by construction: we ONLY ever fetch `photo.upstreamUrl` for a
 * photo already present in the cached pool — never a URL taken from the
 * request. Manual photos have no `upstreamUrl` (their `src` is loaded
 * directly), so they 404 here, which is correct.
 */
export async function GET(
    req: NextRequest,
    context: { params: Promise<{ photoId: string }> },
) {
    const { photoId } = await context.params;
    const domainName = req.headers.get("domain");
    const domain = domainName ? await getCachedDomain(domainName) : null;
    if (!domain) {
        return new Response("Not found", { status: 404, headers });
    }

    const admitted = await getCurrentPoolPhoto(domain, photoId);
    const photo = admitted?.photo;
    if (!admitted || !photo?.upstreamUrl) {
        return new Response("Not found", { status: 404, headers });
    }

    let upstream: Response;
    try {
        upstream = await fetch(photo.upstreamUrl, { cache: "no-store" });
    } catch {
        return new Response("Upstream fetch failed", { status: 502, headers });
    }
    if (!upstream.ok || !upstream.body) {
        return new Response("Upstream error", { status: 502, headers });
    }

    const current = await getCurrentPoolPhoto(domain, photoId);
    if (
        current?.sourceKey !== admitted.sourceKey ||
        current?.photo.upstreamUrl !== photo.upstreamUrl
    ) {
        await upstream.body.cancel();
        return new Response("Not found", { status: 404, headers });
    }

    return new Response(upstream.body, {
        status: 200,
        headers: {
            "Content-Type":
                upstream.headers.get("content-type") ?? "image/jpeg",
            ...headers,
        },
    });
}
