import type {
    SocialHeroConfig,
    SocialHeroPoolCache,
} from "@courselit/common-models";
import DomainModel, { Domain } from "@models/Domain";
import { invalidateDomainCache } from "@/lib/domain-cache";
import { buildPool, isPoolStale, sourceKey, toServedPhoto } from "./pool-core";
import type { ServedPool } from "./pool-core";

export type { ServedPool } from "./pool-core";
type Identity = Pick<Domain, "_id" | "name">;

// The tenant cache may predate an edit. Source admission reads the current record.
function currentDomain(domain: Identity) {
    return DomainModel.findOne({
        _id: domain._id,
        name: domain.name,
        deleted: false,
    })
        .select("name settings.socialHero settings.socialHeroPool")
        .lean();
}

async function rebuildAndPersist(domain: Identity, config: SocialHeroConfig) {
    const photos = await buildPool(config);
    const cache: SocialHeroPoolCache = {
        sourceKey: sourceKey(config),
        builtAt: new Date().toISOString(),
        photos,
    };
    // An edit/disable during a network refresh must not resurrect its old pool.
    const saved = await DomainModel.updateOne(
        {
            _id: domain._id,
            name: domain.name,
            deleted: false,
            "settings.socialHero.enabled": true,
            "settings.socialHero.sources": config.sources,
        },
        { $set: { "settings.socialHeroPool": cache } },
    );
    if (saved.matchedCount) invalidateDomainCache(domain.name);
}

// Work deduplication only. Cross-process correctness comes from the CAS.
const rebuildsInFlight = new Set<string>();
function triggerAsyncRebuild(domain: Identity, config: SocialHeroConfig): void {
    const key = `${domain._id}:${sourceKey(config)}`;
    if (rebuildsInFlight.has(key)) return;
    rebuildsInFlight.add(key);
    // Failed refresh keeps a pool with the SAME proved source configuration.
    void rebuildAndPersist(domain, config)
        .catch(() => undefined)
        .finally(() => rebuildsInFlight.delete(key));
}

/** Current, source-bound cached photo. Never rebuilds or admits legacy evidence. */
export async function getCurrentPoolPhoto(domain: Identity, photoId: string) {
    const current = await currentDomain(domain);
    const config = current?.settings?.socialHero;
    const cache = current?.settings?.socialHeroPool;
    if (!config?.enabled || cache?.sourceKey !== sourceKey(config)) return null;
    const photo = cache.photos.find((candidate) => candidate.id === photoId);
    return photo ? { photo, sourceKey: cache.sourceKey } : null;
}

/** Stale refresh is allowed only within an unchanged source configuration. */
export async function getServedPool(domain: Domain): Promise<ServedPool> {
    // Bounded retries cover edits during synchronous builds. A continuously
    // changing configuration yields an empty pool, never unproved old photos.
    for (let attempt = 0; attempt < 3; attempt++) {
        const current = await currentDomain(domain);
        const config = current?.settings?.socialHero;
        if (!config?.enabled) {
            return {
                enabled: false,
                rotationSeconds: config?.rotationSeconds ?? 60,
                photos: [],
            };
        }
        const cache = current?.settings?.socialHeroPool;
        if (cache?.builtAt && cache.sourceKey === sourceKey(config)) {
            if (
                isPoolStale(
                    cache.builtAt,
                    config.poolRefreshMinutes,
                    Date.now(),
                )
            ) {
                triggerAsyncRebuild(domain, config);
            }
            return {
                enabled: true,
                rotationSeconds: config.rotationSeconds,
                photos: cache.photos.map(toServedPhoto),
            };
        }
        await rebuildAndPersist(domain, config);
        // Reread after the await: even a successful CAS may have been followed
        // by a settings edit before this request resumes.
    }
    return { enabled: false, rotationSeconds: 60, photos: [] };
}
