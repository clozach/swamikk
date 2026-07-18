/**
 * @jest-environment node
 */

import { getMedias } from "../logic";
import constants from "@/config/constants";
import GQLContext from "@/models/GQLContext";
import { responses } from "@/config/strings";

const { permissions } = constants;

function makeCtx(perms: string[]): GQLContext {
    return {
        subdomain: { _id: "domain-oid", name: "acme" },
        user: { userId: "u1", permissions: perms },
    } as unknown as GQLContext;
}

function makeMedia(mediaId: string, extra: Record<string, unknown> = {}) {
    return {
        mediaId,
        originalFileName: `${mediaId}.mp4`,
        mimeType: "video/mp4",
        size: 100,
        access: "public",
        thumbnail: `https://cdn.test/${mediaId}/thumb.webp`,
        ...extra,
    };
}

describe("getMedias", () => {
    it("throws when the user has manageMedia but is not an admin", async () => {
        // Every signup is granted manageMedia so members can attach images to
        // community posts (auth.ts). That must not be enough to enumerate the
        // whole school's media library.
        const deps = {
            listMedia: jest.fn(),
            collectUsage: jest.fn(),
        };
        await expect(
            getMedias(makeCtx([permissions.manageMedia]), {}, deps as any),
        ).rejects.toThrow(responses.action_not_allowed);
        expect(deps.listMedia).not.toHaveBeenCalled();
    });

    it("throws when the user lacks manageMedia", async () => {
        const deps = {
            listMedia: jest.fn(),
            collectUsage: jest.fn(),
        };
        await expect(
            getMedias(makeCtx([permissions.manageCourse]), {}, deps as any),
        ).rejects.toThrow(responses.action_not_allowed);
        expect(deps.listMedia).not.toHaveBeenCalled();
    });

    it("scopes the list to the tenant's domain name and default paging", async () => {
        const deps = {
            listMedia: jest.fn().mockResolvedValue([]),
            collectUsage: jest.fn().mockResolvedValue(new Map()),
        };
        await getMedias(
            makeCtx([permissions.manageMedia, permissions.manageSite]),
            {},
            deps as any,
        );
        expect(deps.listMedia).toHaveBeenCalledWith("acme", 1, 50, {});
        expect(deps.collectUsage).toHaveBeenCalledWith("domain-oid");
    });

    it("passes an access filter through when provided", async () => {
        const deps = {
            listMedia: jest.fn().mockResolvedValue([]),
            collectUsage: jest.fn().mockResolvedValue(new Map()),
        };
        await getMedias(
            makeCtx([permissions.manageMedia, permissions.manageSite]),
            { page: 2, limit: 10, access: "private" },
            deps as any,
        );
        expect(deps.listMedia).toHaveBeenCalledWith("acme", 2, 10, {
            access: "private",
        });
    });

    it("attaches usage to each media and empties unreferenced ones", async () => {
        const deps = {
            listMedia: jest
                .fn()
                .mockResolvedValue([makeMedia("used"), makeMedia("orphan")]),
            collectUsage: jest.fn().mockResolvedValue(
                new Map([
                    [
                        "used",
                        [
                            {
                                entityType: "course",
                                entityId: "c1",
                                title: "Nervous System Reset",
                            },
                            {
                                entityType: "page",
                                entityId: "p1",
                                title: "Home page",
                            },
                        ],
                    ],
                ]),
            ),
        };

        const result = await getMedias(
            makeCtx([permissions.manageMedia, permissions.manageSite]),
            {},
            deps as any,
        );

        const used = result.find((m) => m.mediaId === "used")!;
        const orphan = result.find((m) => m.mediaId === "orphan")!;
        expect(used.usage.map((u) => u.title)).toEqual([
            "Nervous System Reset",
            "Home page",
        ]);
        expect(orphan.usage).toEqual([]);
        // Non-usage fields are preserved from the MediaLit listing.
        expect(used.originalFileName).toBe("used.mp4");
        expect(used.thumbnail).toBe("https://cdn.test/used/thumb.webp");
    });
});
