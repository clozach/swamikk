import { z } from "zod";
import type {
    SocialFeedSource,
    SocialHeroConfig,
} from "@courselit/common-models";

/**
 * Social-hero config boundary helpers.
 *
 * The DB and GraphQL wire carry a PERMISSIVE superset of the config; these
 * helpers are the single boundary that (a) parses that superset into the safe
 * `SocialFeedSource` tagged union, (b) preserves stored access tokens when an
 * edit omits them, and (c) masks tokens on read so a raw token never leaves
 * the server. Keeping all three here means the resolvers stay thin and the
 * token-safety invariant lives in one testable place.
 */

const trimmed = z.string().trim();
const nonEmpty = trimmed.min(1);

const instagramSource = z.object({
    kind: z.literal("instagram"),
    id: nonEmpty,
    label: nonEmpty,
    igUserId: nonEmpty,
    accessToken: nonEmpty,
    limit: z.number().int().min(1).max(50),
});

const facebookSource = z.object({
    kind: z.literal("facebook"),
    id: nonEmpty,
    label: nonEmpty,
    pageId: nonEmpty,
    accessToken: nonEmpty,
    limit: z.number().int().min(1).max(50),
});

const manualSource = z.object({
    kind: z.literal("manual"),
    id: nonEmpty,
    label: nonEmpty,
    imageUrl: z.string().trim().url(),
    postUrl: z.string().trim().url(),
    // A bare host like "instagram.com" — used only to key the button glyph and
    // (fallback) to build a favicon URL, so keep it a plain non-empty token.
    networkDomain: nonEmpty,
    // Empty alt is legitimate — it marks the image decorative.
    alt: trimmed,
});

const feedSourceSchema = z.discriminatedUnion("kind", [
    instagramSource,
    facebookSource,
    manualSource,
]);

const configSchema = z.object({
    enabled: z.boolean(),
    rotationSeconds: z.number().int().min(3).max(3600),
    poolRefreshMinutes: z.number().int().min(1).max(1440),
    sources: z.array(feedSourceSchema),
});

/** True for the token-bearing (network) source kinds. */
const isTokenSource = (source: {
    kind: string;
}): source is Extract<SocialFeedSource, { accessToken: string }> =>
    source.kind === "instagram" || source.kind === "facebook";

/**
 * Fill in preserved access tokens BEFORE validation.
 *
 * A blank/omitted `accessToken` on a network source means "keep whatever is
 * stored" (matched by id) — the same convention `updateGoogleProvider` uses
 * for its client secret. After this pass, a network source still missing a
 * token is a genuinely-unconfigured source and zod will reject it.
 */
export function mergePreservedTokens(
    incoming: unknown,
    stored: SocialHeroConfig | undefined,
): unknown {
    if (
        !incoming ||
        typeof incoming !== "object" ||
        !Array.isArray((incoming as { sources?: unknown }).sources)
    ) {
        return incoming;
    }
    const storedById = new Map((stored?.sources ?? []).map((s) => [s.id, s]));
    const sources = (incoming as { sources: unknown[] }).sources.map((raw) => {
        if (!raw || typeof raw !== "object") {
            return raw;
        }
        const src = raw as Record<string, unknown>;
        if (
            (src.kind === "instagram" || src.kind === "facebook") &&
            (typeof src.accessToken !== "string" ||
                src.accessToken.trim() === "")
        ) {
            const prior = storedById.get(src.id as string);
            if (prior && isTokenSource(prior)) {
                return { ...src, accessToken: prior.accessToken };
            }
        }
        return src;
    });
    return { ...(incoming as object), sources };
}

/**
 * Parse a raw config into the safe tagged union. Throws (zod) on any invalid
 * shape — call after {@link mergePreservedTokens}.
 */
export function parseSocialHeroConfig(raw: unknown): SocialHeroConfig {
    return configSchema.parse(raw) as SocialHeroConfig;
}

/** The masked, client-safe projection of one source — never carries a token. */
export interface MaskedSocialFeedSource {
    kind: string;
    id: string;
    label: string;
    igUserId?: string;
    pageId?: string;
    limit?: number;
    hasAccessToken?: boolean;
    accessTokenLast4?: string | null;
    imageUrl?: string;
    postUrl?: string;
    networkDomain?: string;
    alt?: string;
}

const last4 = (token: string): string | null =>
    token.length >= 4 ? token.slice(-4) : token ? "••••" : null;

/** Mask one source for read — strips the raw token, keeps a `…last4` hint. */
export function maskSource(source: SocialFeedSource): MaskedSocialFeedSource {
    if (source.kind === "manual") {
        const { kind, id, label, imageUrl, postUrl, networkDomain, alt } =
            source;
        return { kind, id, label, imageUrl, postUrl, networkDomain, alt };
    }
    const { accessToken, ...rest } = source;
    return {
        ...rest,
        hasAccessToken: !!accessToken,
        accessTokenLast4: last4(accessToken),
    };
}

/** Mask a whole config for an admin read. */
export function maskSocialHeroConfig(config: SocialHeroConfig): {
    enabled: boolean;
    rotationSeconds: number;
    poolRefreshMinutes: number;
    sources: MaskedSocialFeedSource[];
} {
    return {
        enabled: config.enabled,
        rotationSeconds: config.rotationSeconds,
        poolRefreshMinutes: config.poolRefreshMinutes,
        sources: config.sources.map(maskSource),
    };
}

/** The config an admin sees when none is stored yet. */
export const DEFAULT_SOCIAL_HERO_CONFIG: SocialHeroConfig = {
    enabled: false,
    rotationSeconds: 60,
    poolRefreshMinutes: 60,
    sources: [],
};
