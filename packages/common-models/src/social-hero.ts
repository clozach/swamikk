/**
 * Social-media hero rotation — shared config types.
 *
 * The homepage hero can rotate through photos drawn from an admin-managed set
 * of social feeds. This file holds the DOMAIN model: a tagged union of feed
 * sources plus the site-level config that wraps them. Adding a network later
 * is adding a variant here, never an `if/else` on network names.
 *
 * ⚠️ SECURITY: `accessToken` is SERVER-ONLY. It must never appear in any
 * public GraphQL output type, any page-block settings blob (page settings are
 * shipped to visitors), or any client bundle. The GraphQL layer exposes a
 * masked projection (`hasAccessToken` / `accessTokenLast4`) instead — see
 * `apps/web/graphql/settings`.
 */

/**
 * One feed source. Tagged on `kind` so illegal field combinations
 * (an Instagram source carrying a `postUrl`, a manual source carrying an
 * `accessToken`) are unrepresentable.
 */
export type SocialFeedSource =
    | {
          kind: "instagram";
          /** Stable id for list CRUD (client-generated uuid). */
          id: string;
          /** Admin-facing name, e.g. "KK's Instagram". */
          label: string;
          igUserId: string;
          /** SERVER-ONLY. Never in public queries / pages / bundles. */
          accessToken: string;
          /** Max photos this source contributes to the pool. */
          limit: number;
      }
    | {
          kind: "facebook";
          id: string;
          label: string;
          pageId: string;
          /** SERVER-ONLY. */
          accessToken: string;
          limit: number;
      }
    | {
          kind: "manual";
          /** Hand-curated: also the test/demo path — needs no credentials. */
          id: string;
          label: string;
          /** Same-origin or any stable image URL. */
          imageUrl: string;
          /** Where the overlay button links. */
          postUrl: string;
          /** e.g. "instagram.com" — drives the button glyph. */
          networkDomain: string;
          /** Image description for accessibility. */
          alt: string;
      };

/** The networks a source can name. Extend by adding a `SocialFeedSource` variant. */
export type SocialFeedSourceKind = SocialFeedSource["kind"];

/** Site-level social-hero config, stored on the domain settings document. */
export interface SocialHeroConfig {
    enabled: boolean;
    /** Client-side rotation cadence. Default 60. */
    rotationSeconds: number;
    /** Server-side pool re-fetch cadence. Default 60. */
    poolRefreshMinutes: number;
    sources: SocialFeedSource[];
}

/**
 * One normalized photo as SERVED to the client by the pool endpoint.
 * Carries no credentials and no upstream/expiring URL.
 */
export interface SocialHeroPhoto {
    /** Network-scoped post id, or the manual source id. */
    id: string;
    /**
     * The URL the CLIENT loads. Manual photos point at their stable image URL;
     * network photos point at the same-origin image proxy
     * (`/api/social-hero/img/<id>`) because upstream CDN URLs expire.
     */
    src: string;
    /** Canonical post permalink the overlay button links to. */
    postUrl: string;
    /** e.g. "instagram.com" — drives the button glyph. */
    networkDomain: string;
    /** Caption-derived (truncated) or admin-supplied description. */
    alt: string;
    /** ISO timestamp the photo entered the pool. */
    fetchedAt: string;
}

/**
 * A pooled photo AS CACHED server-side. Adds the expiring upstream URL the
 * image proxy fetches from; this field is stripped before the photo is served.
 */
export interface CachedSocialHeroPhoto extends SocialHeroPhoto {
    /** SERVER-ONLY: upstream (CDN) URL the proxy streams from. Never served. */
    upstreamUrl?: string;
}

/** The cached, stale-while-revalidate pool, stored on the domain settings. */
export interface SocialHeroPoolCache {
    /** ISO timestamp the pool was last built. */
    builtAt: string;
    photos: CachedSocialHeroPhoto[];
}
