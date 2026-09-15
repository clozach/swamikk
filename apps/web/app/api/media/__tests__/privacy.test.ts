import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import Domain from "@/models/Domain";
import User from "@/models/User";
import { auth } from "@/auth";
import { getMedia as upstreamMedia } from "@/services/medialit";
import { getMedia, getMedias } from "@/graphql/media/logic";
import { GET } from "../[mediaId]/route";
import { proxy } from "../../../../proxy";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    listMedia: jest.fn(),
}));
jest.mock("@/app/actions", () => ({ getBackendAddress: jest.fn() }));
let domain: any, member: any;
const photo = {
    mediaId: "legacy-photo",
    file: "https://cdn.example/path/portrait.jpg?old=signature",
    thumbnail: "https://cdn.example/path/thumb.webp",
    access: "public",
    mimeType: "image/jpeg",
    size: 128,
    originalFileName: "portrait.jpg",
} as any;
beforeEach(async () => {
    const id = randomUUID();
    domain = await Domain.create({ name: id, email: `${id}@example.com` });
    member = await User.create({
        domain: domain._id,
        userId: id,
        email: domain.email,
        active: true,
        avatar: photo,
    });
    jest.clearAllMocks();
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(null);
});
it.each(["guest", "member", "admin"])(
    "never signs or downloads retired avatar IDs through generic media for %s",
    async (viewer) => {
        if (viewer !== "guest")
            (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
                user: { email: member.email },
            });
        if (viewer === "admin")
            await member.updateOne({ permissions: ["user:manage"] });
        const request = new NextRequest(
            "https://school.example/api/media/legacy-photo",
            { headers: { domain: domain.name } },
        );
        expect(
            (
                await GET(request, {
                    params: Promise.resolve({ mediaId: photo.mediaId }),
                })
            ).status,
        ).toBe(404);
        expect(upstreamMedia).not.toHaveBeenCalled();
        expect(await getMedia({ ...photo, access: "private" })).toBeNull();
        expect(upstreamMedia).not.toHaveBeenCalled();
    },
);
it.each([
    photo.file,
    photo.thumbnail,
    "https://cdn.example/path/portrait.jpg?new=signature",
    "/api/contact-preferences/photo?v=7",
])("refuses optimizer caching of private or retired photo %s", async (url) => {
    const request = new NextRequest(
        "https://school.example/_next/image?" +
            new URLSearchParams({ url, w: "128", q: "75" }),
    );
    const result = await proxy(request);
    expect(result.status).toBe(404);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
});
it("preserves normal business images in GraphQL and optimizer", async () => {
    const business = {
        ...photo,
        mediaId: "business-image",
        file: "https://cdn.example/path/course.jpg",
    };
    expect(await getMedia(business)).toBe(business);
    const request = new NextRequest(
        "https://school.example/_next/image?" +
            new URLSearchParams({ url: business.file, w: "128", q: "75" }),
    );
    expect((await proxy(request)).status).toBe(200);
});
it("does not enumerate retired member photos in the generic media library", async () => {
    const business = { ...photo, mediaId: "business-image" };
    const result = await getMedias(
        {
            subdomain: domain,
            user: {
                ...member.toObject(),
                permissions: ["media:manage", "site:manage"],
            },
        } as any,
        {},
        {
            listMedia: jest.fn().mockResolvedValue([photo, business]),
            collectUsage: jest.fn().mockResolvedValue(new Map()),
        },
    );
    expect(result.map((item) => item.mediaId)).toEqual(["business-image"]);
});
