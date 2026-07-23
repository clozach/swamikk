import { NextRequest } from "next/server";
import { getCachedDomain } from "@/lib/domain-cache";

export const dynamic = "force-dynamic";

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
        return new Response("Not found", { status: 404 });
    }

    const photo = domain.settings?.socialHeroPool?.photos?.find(
        (p) => p.id === photoId,
    );
    if (!photo?.upstreamUrl) {
        return new Response("Not found", { status: 404 });
    }

    let upstream: Response;
    try {
        upstream = await fetch(photo.upstreamUrl);
    } catch {
        return new Response("Upstream fetch failed", { status: 502 });
    }
    if (!upstream.ok || !upstream.body) {
        return new Response("Upstream error", { status: 502 });
    }

    return new Response(upstream.body, {
        status: 200,
        headers: {
            "Content-Type":
                upstream.headers.get("content-type") ?? "image/jpeg",
            "Cache-Control":
                "public, max-age=3600, stale-while-revalidate=86400",
        },
    });
}
