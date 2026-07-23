import type {
    CachedSocialHeroPhoto,
    SocialFeedSource,
} from "@courselit/common-models";

/**
 * One adapter per source kind, each normalizing a source into pooled photos.
 * Adapters never throw for an unconfigured/unreachable source — they return
 * `[]` so a dead feed degrades the pool to "contributes nothing", never
 * "hero breaks".
 *
 * Manual sources are the only LIVE adapter. Instagram/Facebook are stubs until
 * Phases 4-5; when wired they will set `src` to the image proxy path and carry
 * the expiring `upstreamUrl` for the proxy to fetch.
 */

/** Same-origin proxy base for network images whose upstream URLs expire. */
export const IMG_PROXY_BASE = "/api/social-hero/img";

export function fetchManual(
    source: Extract<SocialFeedSource, { kind: "manual" }>,
    fetchedAt: string,
): CachedSocialHeroPhoto[] {
    // Manual images are already hosted at a stable URL — served directly, no
    // proxy, no upstream.
    return [
        {
            id: source.id,
            src: source.imageUrl,
            postUrl: source.postUrl,
            networkDomain: source.networkDomain,
            alt: source.alt,
            fetchedAt,
        },
    ];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchInstagram(
    _source: Extract<SocialFeedSource, { kind: "instagram" }>,
    _fetchedAt: string,
): Promise<CachedSocialHeroPhoto[]> {
    // NOT WIRED until Phase 4 — see social-hero-dev-plan.md §6.
    return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchFacebook(
    _source: Extract<SocialFeedSource, { kind: "facebook" }>,
    _fetchedAt: string,
): Promise<CachedSocialHeroPhoto[]> {
    // NOT WIRED until Phase 5 — see social-hero-dev-plan.md §6.
    return [];
}
