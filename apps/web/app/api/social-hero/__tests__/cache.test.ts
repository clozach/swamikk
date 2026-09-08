import { NextRequest } from "next/server";
import type {
    SocialHeroConfig,
    SocialHeroPoolCache,
} from "@courselit/common-models";
import DomainModel, { Domain } from "@models/Domain";
import { getCachedDomain, invalidateDomainCache } from "@/lib/domain-cache";
import * as core from "@/lib/social-hero/pool-core";
import { getServedPool } from "@/lib/social-hero/pool";
import { GET as poolGet } from "../pool/route";
import { GET as imageGet } from "../img/[photoId]/route";

jest.mock("@/lib/domain-cache", () => ({
    getCachedDomain: jest.fn(),
    invalidateDomainCache: jest.fn(),
}));
const config = (url = "https://old.example/photo.jpg"): SocialHeroConfig => ({
    enabled: true,
    rotationSeconds: 6,
    poolRefreshMinutes: 60,
    sources: [
        {
            kind: "manual",
            id: "photo",
            label: "Photo",
            imageUrl: url,
            postUrl: "https://example.com/",
            networkDomain: "example.com",
            alt: "Photo",
        },
    ],
});
const gate = () => {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { promise, release };
};
let domain: Domain;
const nativeBuild = core.buildPool;
async function saveConfig(next: SocialHeroConfig) {
    await DomainModel.updateOne(
        { _id: domain._id },
        { $set: { "settings.socialHero": next } },
    );
}
async function savedCache() {
    return (await DomainModel.findById(domain._id).lean())!.settings!
        .socialHeroPool!;
}
async function seedCache(
    cfg = config(),
    extra: Partial<SocialHeroPoolCache> = {},
) {
    const cache = {
        sourceKey: core.sourceKey(cfg),
        builtAt: new Date().toISOString(),
        photos: await nativeBuild(cfg),
        ...extra,
    };
    await DomainModel.updateOne(
        { _id: domain._id },
        { $set: { "settings.socialHeroPool": cache } },
    );
    return cache;
}
const request = () =>
    new NextRequest("http://localhost/api/social-hero/pool", {
        headers: { domain: domain.name },
    });
const proxy = () =>
    imageGet(request(), { params: Promise.resolve({ photoId: "photo" }) });

beforeEach(async () => {
    domain = await DomainModel.create({
        name: `hero-cache-${Date.now()}-${Math.random()}`,
        email: "cache@example.com",
        settings: { socialHero: config() },
    });
    jest.mocked(getCachedDomain).mockResolvedValue(domain);
    jest.mocked(invalidateDomainCache).mockClear();
});
afterEach(async () => {
    jest.restoreAllMocks();
    await DomainModel.deleteOne({ _id: domain._id });
});

it("a fresh legacy pool and stale tenant object cannot preserve a replaced source or credit", async () => {
    await seedCache(config(), { sourceKey: undefined });
    const next = config("http://localhost/anahata/local.png");
    if (next.sources[0].kind === "manual")
        next.sources[0].postUrl = "https://correct.example/";
    await saveConfig(next);
    const served = await getServedPool(domain);
    expect(served.photos).toMatchObject([
        {
            src: "http://localhost/anahata/local.png",
            postUrl: "https://correct.example/",
        },
    ]);
    expect((await savedCache()).sourceKey).toBe(core.sourceKey(next));
    expect(JSON.stringify(served)).not.toContain("sourceKey");
});

it.each(["replace", "remove", "disable"])(
    "a delayed old build cannot persist or return photos after %s",
    async (action) => {
        const entered = gate(),
            resume = gate();
        jest.spyOn(core, "buildPool").mockImplementationOnce(async (cfg) => {
            entered.release();
            await resume.promise;
            return nativeBuild(cfg);
        });
        const pending = getServedPool(domain);
        await entered.promise;
        const next = config("http://localhost/new.jpg");
        if (action === "remove") next.sources = [];
        if (action === "disable") next.enabled = false;
        await saveConfig(next);
        resume.release();
        const served = await pending;
        expect(served.photos.map((p) => p.src)).toEqual(
            action === "replace" ? ["http://localhost/new.jpg"] : [],
        );
        expect(served.enabled).toBe(action !== "disable");
        const cache = await savedCache();
        expect(
            cache?.photos.some((p) => p.src.includes("old.example")),
        ).not.toBe(true);
    },
);

it("rereads an edit after a successful build CAS but before returning the current request", async () => {
    const original = DomainModel.updateOne.bind(DomainModel);
    let edited = false;
    jest.spyOn(DomainModel, "updateOne").mockImplementation(((
        filter: unknown,
        update: Record<string, any>,
        ...rest: unknown[]
    ) => {
        if (update.$set?.["settings.socialHeroPool"] && !edited) {
            edited = true;
            return original(filter as any, update).then(async (result) => {
                await original(
                    { _id: domain._id },
                    {
                        $set: {
                            "settings.socialHero": config(
                                "http://localhost/after-cas.jpg",
                            ),
                        },
                    },
                );
                return result;
            });
        }
        return original(filter as any, update, ...(rest as []));
    }) as typeof DomainModel.updateOne);
    expect((await getServedPool(domain)).photos[0].src).toBe(
        "http://localhost/after-cas.jpg",
    );
});

it("preserves a same-source stale pool through failed refresh and cadence edits", async () => {
    const old = await seedCache(config(), {
        builtAt: "2020-01-01T00:00:00.000Z",
    });
    await saveConfig({ ...config(), rotationSeconds: 12 });
    const failed = gate();
    jest.spyOn(core, "buildPool").mockImplementation(async () => {
        failed.release();
        throw Error("isolated refresh failure");
    });
    const served = await getServedPool(domain);
    await failed.promise;
    await new Promise((resolve) => setImmediate(resolve));
    expect(served.rotationSeconds).toBe(12);
    expect(served.photos).toEqual(old.photos);
    expect(await savedCache()).toEqual(old);
});

it("an async stale refresh cannot restore a source removed while it was running", async () => {
    await seedCache(config(), { builtAt: "2020-01-01T00:00:00.000Z" });
    const entered = gate(),
        resume = gate(),
        finished = gate();
    const original = DomainModel.updateOne.bind(DomainModel);
    jest.spyOn(DomainModel, "updateOne").mockImplementation(((
        filter: any,
        update: any,
    ) => {
        const result = original(filter, update);
        if (update.$set?.["settings.socialHeroPool"])
            return result.then((r) => {
                finished.release();
                return r;
            });
        return result;
    }) as typeof DomainModel.updateOne);
    jest.spyOn(core, "buildPool").mockImplementationOnce(async (cfg) => {
        entered.release();
        await resume.promise;
        return nativeBuild(cfg);
    });
    await getServedPool(domain);
    await entered.promise;
    await saveConfig({ ...config(), sources: [] });
    resume.release();
    await finished.promise;
    expect(jest.mocked(invalidateDomainCache)).not.toHaveBeenCalled();
    expect((await getServedPool(domain)).photos).toEqual([]);
});

it("public pool responses disable intermediary reuse, including unknown tenants", async () => {
    const response = await poolGet(request());
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
        enabled: true,
        photos: [{ id: "photo" }],
    });
    jest.mocked(getCachedDomain).mockResolvedValue(null);
    expect((await poolGet(request())).headers.get("cache-control")).toBe(
        "no-store",
    );
});

async function seedProxy() {
    const cache = await seedCache();
    cache.photos[0].upstreamUrl = "https://upstream.example/photo.jpg";
    cache.photos[0].src = "/api/social-hero/img/photo";
    await DomainModel.updateOne(
        { _id: domain._id },
        { $set: { "settings.socialHeroPool": cache } },
    );
}

it.each(["disabled", "replaced", "legacy"])(
    "proxy refuses %s cached upstream before any fetch",
    async (state) => {
        await seedProxy();
        if (state === "disabled")
            await saveConfig({ ...config(), enabled: false });
        if (state === "replaced")
            await saveConfig(config("http://localhost/replacement.jpg"));
        if (state === "legacy")
            await DomainModel.updateOne(
                { _id: domain._id },
                { $unset: { "settings.socialHeroPool.sourceKey": "" } },
            );
        const fetcher = jest.spyOn(global, "fetch");
        const response = await proxy();
        expect(response.status).toBe(404);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(fetcher).not.toHaveBeenCalled();
    },
);

it("proxy streams only a current admitted photo without reusable response caching", async () => {
    await seedProxy();
    const fetcher = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(
            new Response("image", { headers: { "content-type": "image/png" } }),
        );
    const response = await proxy();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("image");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetcher).toHaveBeenCalledWith("https://upstream.example/photo.jpg", {
        cache: "no-store",
    });
});

it("proxy discards an in-flight upstream response if its source is disabled", async () => {
    await seedProxy();
    const entered = gate(),
        resume = gate();
    jest.spyOn(global, "fetch").mockImplementation(async () => {
        entered.release();
        await resume.promise;
        return new Response("obsolete-image");
    });
    const pending = proxy();
    await entered.promise;
    await saveConfig({ ...config(), enabled: false });
    resume.release();
    const response = await pending;
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("obsolete-image");
});
