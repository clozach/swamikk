import { NextRequest } from "next/server";
import { getCachedDomain } from "@/lib/domain-cache";
import { getServedPool } from "@/lib/social-hero/pool";

export const dynamic = "force-dynamic";

/**
 * Public, sanitized photo pool for the hero. Contains ZERO config/token
 * internals — only `{ enabled, rotationSeconds, photos }`. Cacheable at the
 * edge (short s-maxage + SWR); the client fetches it once per page view.
 */
export async function GET(req: NextRequest) {
    // The `domain` header is injected by proxy.ts (matcher covers /api/*),
    // same as the GraphQL route resolves its tenant.
    const domainName = req.headers.get("domain");
    const domain = domainName ? await getCachedDomain(domainName) : null;
    if (!domain) {
        return Response.json(
            { enabled: false, rotationSeconds: 60, photos: [] },
            { status: 200 },
        );
    }

    const pool = await getServedPool(domain);
    return Response.json(pool, {
        status: 200,
        headers: {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
    });
}
