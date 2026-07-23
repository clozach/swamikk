import type {
    SocialHeroConfig,
    SocialHeroPoolCache,
} from "@courselit/common-models";
import DomainModel, { Domain } from "@models/Domain";
import { buildPool, isPoolStale, toServedPhoto } from "./pool-core";
import type { ServedPool } from "./pool-core";

export type { ServedPool } from "./pool-core";

/** Build + persist the pool onto the domain settings; returns the new cache. */
async function rebuildAndPersist(
    domain: Domain,
    config: SocialHeroConfig,
): Promise<SocialHeroPoolCache> {
    const photos = await buildPool(config);
    const cache: SocialHeroPoolCache = {
        builtAt: new Date().toISOString(),
        photos,
    };
    await DomainModel.updateOne(
        { _id: (domain as any)._id },
        { $set: { "settings.socialHeroPool": cache } },
    );
    return cache;
}

// Per-server-instance lock so a stale-triggered rebuild runs once at a time
// per domain. The rig and box are single-instance, so this is sufficient.
const rebuildsInFlight = new Set<string>();

function triggerAsyncRebuild(domain: Domain, config: SocialHeroConfig): void {
    const key = String((domain as any)._id);
    if (rebuildsInFlight.has(key)) {
        return;
    }
    rebuildsInFlight.add(key);
    // Fire-and-forget: a failed refresh leaves the stale pool in place — the
    // hero must never break because a feed went down.
    void rebuildAndPersist(domain, config)
        .catch(() => undefined)
        .finally(() => rebuildsInFlight.delete(key));
}

/**
 * Serve the pool with stale-while-revalidate semantics:
 * - feature off / no config → empty, enabled:false;
 * - no cache yet → build synchronously (first call pays the cost);
 * - stale cache → serve it immediately AND kick a locked async rebuild;
 * - fresh cache → serve as-is.
 */
export async function getServedPool(domain: Domain): Promise<ServedPool> {
    const config = domain.settings?.socialHero;
    if (!config || !config.enabled) {
        return {
            enabled: false,
            rotationSeconds: config?.rotationSeconds ?? 60,
            photos: [],
        };
    }

    let cache = domain.settings?.socialHeroPool;
    if (!cache || !cache.builtAt) {
        cache = await rebuildAndPersist(domain, config);
    } else if (
        isPoolStale(cache.builtAt, config.poolRefreshMinutes, Date.now())
    ) {
        triggerAsyncRebuild(domain, config);
    }

    return {
        enabled: true,
        rotationSeconds: config.rotationSeconds,
        photos: (cache?.photos ?? []).map(toServedPhoto),
    };
}
