import type {
    CachedSocialHeroPhoto,
    SocialFeedSource,
    SocialHeroConfig,
} from "@courselit/common-models";
import {
    POOL_CAP,
    buildPool,
    dedupeById,
    isPoolStale,
    toServedPhoto,
} from "../pool-core";

const identity = <T>(items: T[]): T[] => items;
const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z");

const manual = (id: string): Extract<SocialFeedSource, { kind: "manual" }> => ({
    kind: "manual",
    id,
    label: `Manual ${id}`,
    imageUrl: `https://cdn.example.com/${id}.jpg`,
    postUrl: `https://instagram.com/p/${id}`,
    networkDomain: "instagram.com",
    alt: `Photo ${id}`,
});

const config = (sources: SocialFeedSource[]): SocialHeroConfig => ({
    enabled: true,
    rotationSeconds: 60,
    poolRefreshMinutes: 60,
    sources,
});

describe("isPoolStale", () => {
    const now = Date.parse("2026-01-01T01:00:00.000Z");

    it("is stale when builtAt is missing", () => {
        expect(isPoolStale(undefined, 60, now)).toBe(true);
    });

    it("is stale when builtAt is unparseable", () => {
        expect(isPoolStale("not-a-date", 60, now)).toBe(true);
    });

    it("is fresh within the refresh window", () => {
        // built 30 min ago, window 60 min
        expect(isPoolStale("2026-01-01T00:30:00.000Z", 60, now)).toBe(false);
    });

    it("is stale at/after the refresh window", () => {
        // built 60 min ago, window 60 min
        expect(isPoolStale("2026-01-01T00:00:00.000Z", 60, now)).toBe(true);
    });
});

describe("dedupeById", () => {
    it("keeps the first photo per id", () => {
        const photos = [
            { id: "a", src: "1" },
            { id: "b", src: "2" },
            { id: "a", src: "3" },
        ] as unknown as CachedSocialHeroPhoto[];
        const out = dedupeById(photos);
        expect(out.map((p) => p.id)).toEqual(["a", "b"]);
        expect(out.find((p) => p.id === "a")!.src).toBe("1");
    });
});

describe("buildPool", () => {
    it("normalizes a manual source into a served-ready photo", async () => {
        const pool = await buildPool(config([manual("x")]), {
            now: FIXED_NOW,
            shuffle: identity,
        });
        expect(pool).toHaveLength(1);
        expect(pool[0]).toEqual({
            id: "x",
            src: "https://cdn.example.com/x.jpg",
            postUrl: "https://instagram.com/p/x",
            networkDomain: "instagram.com",
            alt: "Photo x",
            fetchedAt: FIXED_NOW.toISOString(),
        });
        expect(pool[0].upstreamUrl).toBeUndefined();
    });

    it("contributes nothing for un-wired instagram/facebook sources", async () => {
        const pool = await buildPool(
            config([
                {
                    kind: "instagram",
                    id: "ig",
                    label: "IG",
                    igUserId: "1",
                    accessToken: "t",
                    limit: 10,
                },
                {
                    kind: "facebook",
                    id: "fb",
                    label: "FB",
                    pageId: "2",
                    accessToken: "t",
                    limit: 10,
                },
            ]),
            { now: FIXED_NOW, shuffle: identity },
        );
        expect(pool).toEqual([]);
    });

    it("dedupes across sources by id", async () => {
        const pool = await buildPool(config([manual("dup"), manual("dup")]), {
            now: FIXED_NOW,
            shuffle: identity,
        });
        expect(pool).toHaveLength(1);
    });

    it(`caps the pool at ${POOL_CAP}`, async () => {
        const sources = Array.from({ length: POOL_CAP + 10 }, (_, i) =>
            manual(`m${i}`),
        );
        const pool = await buildPool(config(sources), {
            now: FIXED_NOW,
            shuffle: identity,
        });
        expect(pool).toHaveLength(POOL_CAP);
    });
});

describe("toServedPhoto", () => {
    it("strips the server-only upstreamUrl", () => {
        const cached: CachedSocialHeroPhoto = {
            id: "n",
            src: "/api/social-hero/img/n",
            postUrl: "https://instagram.com/p/n",
            networkDomain: "instagram.com",
            alt: "Network photo",
            fetchedAt: FIXED_NOW.toISOString(),
            upstreamUrl: "https://scontent.cdninstagram.com/expiring.jpg",
        };
        const served = toServedPhoto(cached);
        expect((served as any).upstreamUrl).toBeUndefined();
        expect(served.src).toBe("/api/social-hero/img/n");
    });
});
