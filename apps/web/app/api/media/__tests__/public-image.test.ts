/** @jest-environment node */
import { resolvePublicImageMedia } from "@/services/content-changes/page-media";
import { isLegacyAvatarMedia } from "@/services/member-privacy";
jest.mock("@/services/member-privacy", () => ({
    isLegacyAvatarMedia: jest.fn(),
}));
const ctx = { subdomain: { _id: "domain", name: "school" } } as never;
const media = {
    mediaId: "image",
    group: "school",
    access: "public",
    mimeType: "image/jpeg",
    file: "https://media.example/image/main.jpg",
    thumbnail: "https://media.example/image/thumb.webp",
} as const;
beforeEach(() => jest.mocked(isLegacyAvatarMedia).mockResolvedValue(false));
it.each([
    { file: "not a URL" },
    { file: "javascript:alert(1)" },
    { thumbnail: "data:image/svg+xml,unsafe" },
    { thumbnail: "broken" },
    { file: "https://user:password@media.example/image" },
])("refuses malformed/provider URL variants before seal", async (override) => {
    const deps = {
        get: jest.fn().mockResolvedValue({ ...media, ...override }),
        seal: jest.fn(),
    };
    await expect(
        resolvePublicImageMedia(ctx, "image", deps),
    ).rejects.toMatchObject({ code: "invalid_media", status: 400 });
    expect(deps.seal).not.toHaveBeenCalled();
});
it("refuses a known member avatar before provider access", async () => {
    jest.mocked(isLegacyAvatarMedia).mockResolvedValue(true);
    const deps = { get: jest.fn(), seal: jest.fn() };
    await expect(
        resolvePublicImageMedia(ctx, "image", deps),
    ).rejects.toMatchObject({ code: "invalid_media", status: 400 });
    expect(deps.get).not.toHaveBeenCalled();
});
it("validates the final sealed addresses too", async () => {
    const deps = {
        get: jest.fn().mockResolvedValue(media),
        seal: jest
            .fn()
            .mockResolvedValue({ ...media, thumbnail: "javascript:bad" }),
    };
    await expect(
        resolvePublicImageMedia(ctx, "image", deps),
    ).rejects.toMatchObject({ code: "invalid_media", status: 400 });
});
