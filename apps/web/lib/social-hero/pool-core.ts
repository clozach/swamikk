import type {
    CachedSocialHeroPhoto,
    SocialHeroConfig,
    SocialHeroPhoto,
} from "@courselit/common-models";
import { fetchFacebook, fetchInstagram, fetchManual } from "./adapters";

/**
 * Pure pool-building core — no DB, no I/O, no environment assumptions, so it
 * unit-tests in isolation. The Mongo-backed stale-while-revalidate
 * orchestration lives in `pool.ts`.
 */

/** Hard ceiling on pooled photos, applied after dedupe + shuffle. */
export const POOL_CAP = 50;

/** The public shape returned by the pool endpoint. */
export interface ServedPool {
    enabled: boolean;
    rotationSeconds: number;
    photos: SocialHeroPhoto[];
}

/** True when the cache is missing/undated or older than its refresh window. */
export function isPoolStale(
    builtAt: string | undefined,
    poolRefreshMinutes: number,
    nowMs: number,
): boolean {
    if (!builtAt) {
        return true;
    }
    const built = Date.parse(builtAt);
    if (Number.isNaN(built)) {
        return true;
    }
    return nowMs - built >= poolRefreshMinutes * 60_000;
}

/** Keep the first photo seen per id; drop later duplicates. */
export function dedupeById(
    photos: CachedSocialHeroPhoto[],
): CachedSocialHeroPhoto[] {
    const seen = new Set<string>();
    const out: CachedSocialHeroPhoto[] = [];
    for (const photo of photos) {
        if (seen.has(photo.id)) {
            continue;
        }
        seen.add(photo.id);
        out.push(photo);
    }
    return out;
}

const defaultShuffle = <T>(items: T[]): T[] => {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

/**
 * Build the pool from a config: fan out to per-kind adapters, dedupe by id,
 * shuffle once, cap. Pure given its `opts` (inject `now`/`shuffle` in tests).
 */
export async function buildPool(
    config: SocialHeroConfig,
    opts: { now?: Date; shuffle?: <T>(items: T[]) => T[] } = {},
): Promise<CachedSocialHeroPhoto[]> {
    const fetchedAt = (opts.now ?? new Date()).toISOString();
    const perSource = await Promise.all(
        config.sources.map((source) => {
            switch (source.kind) {
                case "manual":
                    return fetchManual(source, fetchedAt);
                case "instagram":
                    return fetchInstagram(source, fetchedAt);
                case "facebook":
                    return fetchFacebook(source, fetchedAt);
            }
        }),
    );
    const shuffle = opts.shuffle ?? defaultShuffle;
    return shuffle(dedupeById(perSource.flat())).slice(0, POOL_CAP);
}

/** Strip the server-only upstream URL before a photo is served. */
export function toServedPhoto(photo: CachedSocialHeroPhoto): SocialHeroPhoto {
    const { id, src, postUrl, networkDomain, alt, fetchedAt } = photo;
    return { id, src, postUrl, networkDomain, alt, fetchedAt };
}
