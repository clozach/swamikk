import { getSocialHeroConfig, updateSocialHeroConfig } from "../logic";
import {
    maskSource,
    mergePreservedTokens,
    parseSocialHeroConfig,
} from "../social-hero-helpers";
import DomainModel from "@models/Domain";
import UserModel from "@models/User";
import constants from "@/config/constants";

jest.mock("@/lib/domain-cache", () => ({
    invalidateDomainCache: jest.fn(),
}));

const SUITE_PREFIX = `social-hero-tests-${Date.now()}`;
const id = (suffix: string) => `${SUITE_PREFIX}-${suffix}`;
const email = (suffix: string) => `${suffix}-${SUITE_PREFIX}@example.com`;

const manualSource = (overrides: Record<string, unknown> = {}) => ({
    kind: "manual",
    id: "src-manual-1",
    label: "Curated shot",
    imageUrl: "https://cdn.example.com/photo.jpg",
    postUrl: "https://instagram.com/p/abc",
    networkDomain: "instagram.com",
    alt: "A curated photo",
    ...overrides,
});

const instagramSource = (overrides: Record<string, unknown> = {}) => ({
    kind: "instagram",
    id: "src-ig-1",
    label: "KK's Instagram",
    igUserId: "1784xxxx",
    accessToken: "IGtoken-abcdef1234",
    limit: 10,
    ...overrides,
});

const baseConfig = (sources: unknown[]) => ({
    enabled: true,
    rotationSeconds: 60,
    poolRefreshMinutes: 60,
    sources,
});

describe("Social Hero pure helpers", () => {
    describe("parseSocialHeroConfig", () => {
        it("accepts a valid manual-source config", () => {
            const parsed = parseSocialHeroConfig(baseConfig([manualSource()]));
            expect(parsed.sources).toHaveLength(1);
            expect(parsed.sources[0].kind).toBe("manual");
        });

        it("accepts a valid instagram source", () => {
            const parsed = parseSocialHeroConfig(
                baseConfig([instagramSource()]),
            );
            expect(parsed.sources[0].kind).toBe("instagram");
        });

        it("rejects a manual source with a non-URL imageUrl", () => {
            expect(() =>
                parseSocialHeroConfig(
                    baseConfig([manualSource({ imageUrl: "not-a-url" })]),
                ),
            ).toThrow();
        });

        it("rejects an instagram source with a blank access token", () => {
            expect(() =>
                parseSocialHeroConfig(
                    baseConfig([instagramSource({ accessToken: "" })]),
                ),
            ).toThrow();
        });

        it("rejects an out-of-range rotationSeconds", () => {
            expect(() =>
                parseSocialHeroConfig({
                    ...baseConfig([manualSource()]),
                    rotationSeconds: 1,
                }),
            ).toThrow();
        });

        it("allows an empty alt on a manual source (decorative)", () => {
            const parsed = parseSocialHeroConfig(
                baseConfig([manualSource({ alt: "" })]),
            );
            expect(parsed.sources[0].kind === "manual").toBe(true);
        });
    });

    describe("mergePreservedTokens", () => {
        const stored = {
            enabled: true,
            rotationSeconds: 60,
            poolRefreshMinutes: 60,
            sources: [
                {
                    kind: "instagram" as const,
                    id: "src-ig-1",
                    label: "KK's Instagram",
                    igUserId: "1784xxxx",
                    accessToken: "STORED-token-9999",
                    limit: 10,
                },
            ],
        };

        it("reuses the stored token when an edit omits it", () => {
            const merged = mergePreservedTokens(
                baseConfig([instagramSource({ accessToken: "" })]),
                stored,
            ) as any;
            expect(merged.sources[0].accessToken).toBe("STORED-token-9999");
        });

        it("keeps a freshly-supplied token", () => {
            const merged = mergePreservedTokens(
                baseConfig([
                    instagramSource({ accessToken: "NEW-token-0001" }),
                ]),
                stored,
            ) as any;
            expect(merged.sources[0].accessToken).toBe("NEW-token-0001");
        });

        it("does not invent a token for an unknown id", () => {
            const merged = mergePreservedTokens(
                baseConfig([
                    instagramSource({ id: "unknown", accessToken: "" }),
                ]),
                stored,
            ) as any;
            expect(merged.sources[0].accessToken).toBe("");
        });
    });

    describe("maskSource", () => {
        it("strips the raw token and exposes only a last-4 hint", () => {
            const masked = maskSource({
                kind: "instagram",
                id: "src-ig-1",
                label: "KK's Instagram",
                igUserId: "1784xxxx",
                accessToken: "IGtoken-abcdef1234",
                limit: 10,
            });
            expect((masked as any).accessToken).toBeUndefined();
            expect(masked.hasAccessToken).toBe(true);
            expect(masked.accessTokenLast4).toBe("1234");
        });

        it("returns manual sources verbatim (no token fields)", () => {
            const masked = maskSource({
                kind: "manual",
                id: "src-manual-1",
                label: "Curated shot",
                imageUrl: "https://cdn.example.com/photo.jpg",
                postUrl: "https://instagram.com/p/abc",
                networkDomain: "instagram.com",
                alt: "A curated photo",
            });
            expect(masked.hasAccessToken).toBeUndefined();
            expect(masked.imageUrl).toBe("https://cdn.example.com/photo.jpg");
        });
    });
});

describe("Social Hero resolvers", () => {
    let testDomain: any;
    let adminUser: any;
    let regularUser: any;
    let mockCtx: any;

    beforeAll(async () => {
        testDomain = await DomainModel.create({
            name: id("domain"),
            email: email("domain"),
            settings: { title: "KK's Club" },
        });
        adminUser = await UserModel.create({
            domain: testDomain._id,
            userId: id("admin"),
            email: email("admin"),
            name: "Admin User",
            permissions: [constants.permissions.manageSettings],
            active: true,
            unsubscribeToken: id("unsub-admin"),
            purchases: [],
        });
        regularUser = await UserModel.create({
            domain: testDomain._id,
            userId: id("regular"),
            email: email("regular"),
            name: "Regular User",
            permissions: [],
            active: true,
            unsubscribeToken: id("unsub-regular"),
            purchases: [],
        });
        mockCtx = { user: adminUser, subdomain: testDomain } as any;
    });

    afterEach(async () => {
        await DomainModel.updateOne(
            { _id: testDomain._id },
            { $unset: { "settings.socialHero": "" } },
        );
        const refreshed = await DomainModel.findById(testDomain._id);
        mockCtx.subdomain = refreshed;
    });

    afterAll(async () => {
        await UserModel.deleteMany({ domain: testDomain._id });
        await DomainModel.deleteOne({ _id: testDomain._id });
    });

    describe("getSocialHeroConfig", () => {
        it("throws for a user without manageSettings", async () => {
            await expect(
                getSocialHeroConfig({ ...mockCtx, user: regularUser }),
            ).rejects.toThrow();
        });

        it("returns the disabled default when none is stored", async () => {
            const result = await getSocialHeroConfig(mockCtx);
            expect(result.enabled).toBe(false);
            expect(result.rotationSeconds).toBe(60);
            expect(result.sources).toEqual([]);
        });

        it("returns a masked config once stored (never the raw token)", async () => {
            await updateSocialHeroConfig(
                baseConfig([instagramSource(), manualSource()]),
                mockCtx,
            );
            const result = await getSocialHeroConfig(mockCtx);
            const ig = result.sources.find((s) => s.kind === "instagram")!;
            expect((ig as any).accessToken).toBeUndefined();
            expect(ig.hasAccessToken).toBe(true);
            expect(ig.accessTokenLast4).toBe("1234");
            expect(JSON.stringify(result)).not.toContain("IGtoken-abcdef1234");
        });
    });

    describe("updateSocialHeroConfig", () => {
        it("throws for a user without manageSettings", async () => {
            await expect(
                updateSocialHeroConfig(baseConfig([manualSource()]), {
                    ...mockCtx,
                    user: regularUser,
                }),
            ).rejects.toThrow();
        });

        it("persists a manual-source config and stores the raw values", async () => {
            const masked = await updateSocialHeroConfig(
                baseConfig([manualSource()]),
                mockCtx,
            );
            expect(masked!.sources).toHaveLength(1);

            const domain = await DomainModel.findById(testDomain._id).lean();
            const stored = (domain as any).settings.socialHero;
            expect(stored.enabled).toBe(true);
            expect(stored.sources[0].imageUrl).toBe(
                "https://cdn.example.com/photo.jpg",
            );
        });

        it("stores the token but never returns it, exposing only last-4", async () => {
            const masked = await updateSocialHeroConfig(
                baseConfig([instagramSource()]),
                mockCtx,
            );
            expect(JSON.stringify(masked)).not.toContain("IGtoken-abcdef1234");

            const domain = await DomainModel.findById(testDomain._id).lean();
            const stored = (domain as any).settings.socialHero;
            expect(stored.sources[0].accessToken).toBe("IGtoken-abcdef1234");
        });

        it("preserves a stored token when a later edit omits it", async () => {
            await updateSocialHeroConfig(
                baseConfig([
                    instagramSource({ accessToken: "FIRST-token-7777" }),
                ]),
                mockCtx,
            );
            // Refresh ctx so the resolver sees the persisted source.
            mockCtx.subdomain = await DomainModel.findById(testDomain._id);

            await updateSocialHeroConfig(
                baseConfig([
                    instagramSource({ label: "Renamed", accessToken: "" }),
                ]),
                mockCtx,
            );

            const domain = await DomainModel.findById(testDomain._id).lean();
            const stored = (domain as any).settings.socialHero;
            expect(stored.sources[0].label).toBe("Renamed");
            expect(stored.sources[0].accessToken).toBe("FIRST-token-7777");
        });

        it("rejects an invalid config without persisting", async () => {
            await expect(
                updateSocialHeroConfig(
                    baseConfig([manualSource({ postUrl: "nope" })]),
                    mockCtx,
                ),
            ).rejects.toThrow();
            const domain = await DomainModel.findById(testDomain._id).lean();
            expect((domain as any).settings.socialHero).toBeUndefined();
        });
    });
});
