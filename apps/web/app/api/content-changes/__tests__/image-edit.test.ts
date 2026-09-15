import { randomUUID } from "crypto";
import { BSON, ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import PageModel from "@/models/Page";
import { auth } from "@/auth";
import { GET as leaves } from "../text/leaves/route";
import { POST as edit } from "../text/edit/route";
import { GET as history } from "../text/history/route";
import { PageTextEditModel } from "@/services/content-changes/models";
import { getMedia, sealMedia, deleteMedia } from "@/services/medialit";
import {
    widgetImageLeaves,
    setImageLeaf,
} from "@/services/content-changes/image-registry";
import {
    patchPageWidget,
    mirrorPageWidgetValue,
} from "@/services/content-changes/page-patch";
import { pageWidgetSnapshot } from "@/services/content-changes/page-registry";
import { defaultsFor } from "@/services/content-changes/text-leaves";
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
    deleteMedia: jest.fn(),
}));

const picture = (mediaId = "new-picture") => ({
    kind: "media",
    media: { mediaId },
});
const wire = (name: string, settings = {}): any => ({
    widgetId: "image",
    name,
    settings,
    shared: false,
    deleteable: true,
});

describe("page image registry", () => {
    it.each([
        ["anahataHeader", "logoSource"],
        ["anahataHero", "bannerImage.source"],
        ["anahataPosts", "posts.0.thumbnail.source"],
        ["anahataGatherings", "events.0.image"],
        ["anahataPrivateSessions", "photo"],
        ["anahataFooter", "columns.2.logoSource"],
    ])(
        "lists default images for %s independently from visible prose",
        (name, path) => {
            expect(
                widgetImageLeaves(wire(name)).map((image) => image.path),
            ).toContain(path);
        },
    );
    it("covers native raster media and click-load tour images, excluding other media and banner entity fields", () => {
        const media = {
            mediaId: "poster",
            mimeType: "image/webp",
            file: "https://media.example/poster.webp",
        };
        expect(widgetImageLeaves(wire("media", { media }))).toHaveLength(1);
        expect(
            widgetImageLeaves(
                wire("anahataTour", {
                    loadStrategy: "click",
                    posterImage: media,
                }),
            ),
        ).toHaveLength(1);
        expect(
            widgetImageLeaves(
                wire("anahataTour", {
                    loadStrategy: "eager",
                    posterImage: media,
                }),
            ),
        ).toEqual([]);
        expect(
            widgetImageLeaves(
                wire("media", {
                    media,
                    youtubeLink: "https://youtube.com/test",
                }),
            ),
        ).toEqual([]);
        expect(
            widgetImageLeaves(
                wire("media", { media: { ...media, mimeType: "video/mp4" } }),
            ),
        ).toEqual([]);
        expect(widgetImageLeaves(wire("banner", { media }))).toEqual([]);
        expect(widgetImageLeaves(wire("anahataNewsletter"))).toEqual([]);
    });
    it("uses legacy aliases and preserves their metadata and unrelated BSON", () => {
        const id = new ObjectId();
        const settings = {
            posts: [
                {
                    id,
                    title: "Kept",
                    thumbnail: {
                        kind: "url",
                        url: "/prior.png",
                        alt: "Portrait",
                        annotation: { at: new Date("2026-01-01") },
                    },
                },
            ],
            extra: id,
        };
        const widget = wire("anahataPosts", settings);
        expect(widgetImageLeaves(widget)[0].value).toEqual({
            kind: "url",
            url: "/prior.png",
        });
        const next: any = setImageLeaf(
            widget,
            "posts.0.thumbnail.source",
            picture() as any,
        );
        expect(next.posts[0].id).toBe(id);
        expect(next.extra).toBe(id);
        expect(next.posts[0].thumbnail.alt).toBe("Portrait");
        expect(next.posts[0].thumbnail.annotation).toBe(
            settings.posts[0].thumbnail.annotation,
        );
        expect(settings.posts[0].thumbnail).not.toHaveProperty("source");
        expect(
            widgetImageLeaves(
                wire("anahataHeader", { logoSrc: "/legacy.png" }),
            )[0].value,
        ).toEqual({ kind: "url", url: "/legacy.png" });
        expect(
            widgetImageLeaves(
                wire("anahataGatherings", {
                    events: [{ imageUrl: "/event.png" }],
                }),
            )[0].value,
        ).toEqual({ kind: "url", url: "/event.png" });
    });
    it("materializes only the selected default root and rejects unregistered/prototype paths", () => {
        const source: any = picture();
        const next: any = setImageLeaf(
            wire("anahataPosts"),
            "posts.0.thumbnail.source",
            source,
        );
        expect(next.posts).toHaveLength(
            (defaultsFor("anahataPosts").posts as any[]).length,
        );
        expect(next.posts[1]).toEqual(
            (defaultsFor("anahataPosts").posts as any[])[1],
        );
        expect(Object.keys(next)).toEqual(["posts"]);
        expect(() =>
            setImageLeaf(
                wire("anahataHero"),
                "constructor.prototype.polluted",
                source,
            ),
        ).toThrow();
    });
});

describe("native metadata in proposal picture/text writes", () => {
    const metadata = {
        id: new ObjectId(),
        at: new Date("2026-01-01"),
        bytes: Buffer.from([7, 8, 9]),
    };
    const widget = () => ({
        ...wire("anahataHero", {
            heading: "Before",
            metadata,
            paragraphs: [{ text: "Original words", metadata }],
        }),
        metadata,
    });
    it("preserves BSON while patching a widget and a paragraph", () => {
        for (const [field, text] of [
            ["heading", "After"],
            ["paragraph:0", "Updated words"],
        ]) {
            const changed: any = patchPageWidget(widget(), field, {
                kind: "text",
                text,
            });
            expect(BSON.serialize(changed.metadata)).toEqual(
                BSON.serialize(metadata),
            );
            expect(BSON.serialize(changed.settings.metadata)).toEqual(
                BSON.serialize(metadata),
            );
            expect(
                BSON.serialize(changed.settings.paragraphs[0].metadata),
            ).toEqual(BSON.serialize(metadata));
        }
    });
    it("retains native BSON in the stored proposal before/after snapshots", () => {
        const before = widget();
        const after = patchPageWidget(before, "heading", {
            kind: "text",
            text: "After",
        });
        for (const source of [before, after]) {
            const snapshot: any = pageWidgetSnapshot(source, "heading");
            expect(BSON.serialize(snapshot.widget.metadata)).toEqual(
                BSON.serialize(metadata),
            );
            expect(BSON.serialize(snapshot.widget.settings.metadata)).toEqual(
                BSON.serialize(metadata),
            );
        }
    });
    it("preserves BSON in a mirrored draft and its nested paragraph metadata", () => {
        for (const [field, text] of [
            ["heading", "After"],
            ["paragraph:0", "Updated words"],
        ]) {
            const changed = patchPageWidget(widget(), field, {
                kind: "text",
                text,
            });
            const mirrored: any = mirrorPageWidgetValue(
                widget(),
                changed,
                field,
            );
            expect(BSON.serialize(mirrored.metadata)).toEqual(
                BSON.serialize(metadata),
            );
            expect(BSON.serialize(mirrored.settings.metadata)).toEqual(
                BSON.serialize(metadata),
            );
            expect(
                BSON.serialize(mirrored.settings.paragraphs[0].metadata),
            ).toEqual(BSON.serialize(metadata));
        }
    });
});

describe("live page image edits", () => {
    let domain: any, user: any, page: any;
    const request = (path: string, body?: unknown, headers = {}) =>
        new NextRequest(`https://site.example${path}`, {
            method: body ? "POST" : "GET",
            headers: {
                domain: domain.name,
                host: "site.example",
                origin: "https://site.example",
                "content-type": "application/json",
                ...headers,
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
    const target = (shared = false) =>
        shared
            ? {
                  kind: "shared-widget-text",
                  pageId: page.pageId,
                  name: "anahataHeader",
              }
            : {
                  kind: "page-widget-text",
                  pageId: page.pageId,
                  widgetId: "image",
              };
    const initial = (shared = false) =>
        widgetImageLeaves(wire(shared ? "anahataHeader" : "anahataHero"))[0]
            .value;
    const change = (
        before: any = initial(),
        after: any = picture(),
        path = "bannerImage.source",
    ) => ({ kind: "image", path, before, after });
    const post = (changes: any[] = [change()], extras = {}, headers = {}) =>
        edit(
            request(
                "/api/content-changes/text/edit",
                { target: target(), changes, ...extras },
                headers,
            ),
        );
    const native = (id: string) => ({
        mediaId: id,
        group: domain.name,
        originalFileName: `${id}.webp`,
        mimeType: "image/webp",
        size: 876,
        access: "public",
        thumbnail: `https://media.example/${id}-small.webp`,
        file: `https://media.example/${id}.webp`,
    });
    beforeEach(async () => {
        const id = randomUUID();
        domain = await DomainModel.create({
            name: `image-edit-${id}`,
            email: `image-${id}@example.com`,
            sharedWidgets: {
                anahataHeader: {
                    name: "anahataHeader",
                    settings: { brandName: "Swami" },
                },
            },
            draftSharedWidgets: {
                anahataHeader: {
                    name: "anahataHeader",
                    settings: { brandName: "Swami" },
                },
            },
        });
        user = await UserModel.create({
            domain: domain._id,
            userId: id,
            email: domain.email,
            active: true,
            permissions: ["site:manage"],
            unsubscribeToken: id,
        });
        const layout = [
            wire("anahataHero"),
            {
                widgetId: "header",
                name: "anahataHeader",
                shared: true,
                deleteable: false,
            },
        ];
        page = await PageModel.create({
            domain: domain._id,
            pageId: id,
            name: "Home",
            creatorId: id,
            type: "site",
            layout,
            draftLayout: layout,
        });
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
            user: { email: user.email },
        });
        (getMedia as jest.Mock).mockImplementation(async (id) => native(id));
        (sealMedia as jest.Mock).mockImplementation(async (id) => native(id));
        (deleteMedia as jest.Mock).mockResolvedValue(true);
    });
    afterEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    it("lists image slots separately and applies canonical metadata with mirrored draft, history and actor", async () => {
        const listing = await (
            await leaves(
                request(
                    `/api/content-changes/text/leaves?pageId=${page.pageId}`,
                ),
            )
        ).json();
        const hero = listing.widgets.find(
            (widget) => widget.widgetId === "image",
        );
        expect(hero.images).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ path: "bannerImage.source" }),
            ]),
        );
        expect(
            hero.leaves.some((leaf) => leaf.path.includes("bannerImage")),
        ).toBe(false);
        const response = await post([
            change(initial(), {
                kind: "media",
                media: {
                    mediaId: "new-picture",
                    file: "https://attacker.example/ignored.png",
                },
            }),
        ]);
        expect(response.status).toBe(200);
        const body = await response.json();
        const saved: any = await PageModel.findById(page._id).lean();
        expect(saved.layout[0].settings.bannerImage.source.media.file).toBe(
            native("new-picture").file,
        );
        expect(saved.layout[0].settings.bannerImage.alt).toBe(
            (defaultsFor("anahataHero").bannerImage as any).alt,
        );
        expect(saved.draftLayout[0].settings).toEqual(saved.layout[0].settings);
        expect(body.edit).toMatchObject({
            userId: user.userId,
            revision: 1,
            changes: [
                {
                    kind: "image",
                    before: initial(),
                    after: saved.layout[0].settings.bannerImage.source,
                },
            ],
        });
        expect(
            await PageTextEditModel.findOne({
                editId: body.edit.editId,
            }).lean(),
        ).toMatchObject({
            state: "applied",
            sourceDocumentId: String(page._id),
        });
        expect(
            (await PageModel.collection.findOne({ _id: page._id }))
                ?.pageTextEditReceipts,
        ).toEqual([]);
    });
    it("restores the exact prior placeholder and records Undo as a retained edit", async () => {
        const saved = await (await post()).json();
        const result = await post(
            [change(saved.edit.changes[0].after, initial())],
            { undoOf: saved.edit.editId },
        );
        expect(result.status).toBe(200);
        const restored: any = await PageModel.findById(page._id).lean();
        expect(restored.layout[0].settings.bannerImage.source).toEqual(
            initial(),
        );
        const rows = await (
            await history(
                request(
                    `/api/content-changes/text/history?pageId=${page.pageId}`,
                ),
            )
        ).json();
        expect(rows.edits).toHaveLength(2);
        expect(rows.edits[0].undoOf).toBe(saved.edit.editId);
        expect(sealMedia).toHaveBeenCalledWith("new-picture", domain._id);
    });
    it("rejects unproven URLs/placeholders, cross-target/forged recovery and unsupported paths", async () => {
        for (const after of [
            { kind: "url", url: "https://arbitrary.example/x.png" },
            { kind: "placeholder", description: "invented" },
        ])
            expect((await post([change(initial(), after)])).status).toBe(400);
        const saved = await (await post()).json();
        expect(
            (
                await post(
                    [
                        change(saved.edit.changes[0].after, {
                            kind: "url",
                            url: "/invented.png",
                        }),
                    ],
                    { undoOf: saved.edit.editId },
                )
            ).status,
        ).toBe(400);
        expect(
            (
                await post([change(saved.edit.changes[0].after, initial())], {
                    undoOf: randomUUID(),
                })
            ).status,
        ).toBe(400);
        expect(
            (await post([change(initial(), picture(), "unlisted.source")]))
                .status,
        ).toBe(400);
        expect(
            (await post([change(initial(), picture(), "__proto__.picture")]))
                .status,
        ).toBe(400);
    });
    it.each([
        { group: "foreign" },
        { access: "private" },
        { mimeType: "image/svg+xml" },
        { mimeType: "video/mp4" },
        { mediaId: "other-id" },
        { file: "javascript:alert(1)" },
        { file: "" },
    ])(
        "refuses invalid MediaLit ownership/type/address %j before any source/history write",
        async (override) => {
            (getMedia as jest.Mock).mockResolvedValue({
                ...native("new-picture"),
                ...override,
            });
            expect((await post()).status).toBe(400);
            expect(
                await PageTextEditModel.countDocuments({ domain: domain._id }),
            ).toBe(0);
            expect(sealMedia).not.toHaveBeenCalled();
        },
    );
    it("keeps native captions separate while replacing and reversing the media source", async () => {
        const old = native("original");
        delete (old as any).group;
        const layout = [
            wire("media", {
                media: { ...old, caption: "A memory of the retreat" },
            }),
        ];
        await PageModel.collection.updateOne(
            { _id: page._id },
            { $set: { layout, draftLayout: layout } },
        );
        const before = widgetImageLeaves(layout[0])[0].value;
        const firstResponse = await post([change(before, picture(), "media")]);
        expect(firstResponse.status).toBe(200);
        const first = await firstResponse.json();
        const current: any = await PageModel.collection.findOne({
            _id: page._id,
        });
        expect(current.layout[0].settings.media.caption).toBe(
            "A memory of the retreat",
        );
        expect(widgetImageLeaves(current.layout[0])[0].value).toEqual(
            first.edit.changes[0].after,
        );
        const undo = await post(
            [change(first.edit.changes[0].after, before, "media")],
            { undoOf: first.edit.editId },
        );
        expect(undo.status).toBe(200);
        const restored: any = await PageModel.collection.findOne({
            _id: page._id,
        });
        expect(restored.layout[0].settings.media).toEqual(
            layout[0].settings.media,
        );
    });

    it("refuses changed MediaLit metadata after sealing", async () => {
        (sealMedia as jest.Mock).mockResolvedValue({
            ...native("new-picture"),
            group: "foreign",
        });
        expect((await post()).status).toBe(400);
        expect(
            await PageTextEditModel.countDocuments({ domain: domain._id }),
        ).toBe(0);
    });
    it("returns actual current image on stale before and preserves a conflicting draft", async () => {
        expect(
            (await post([change({ kind: "url", url: "/wrong.png" })])).status,
        ).toBe(409);
        expect(sealMedia).not.toHaveBeenCalled();
        await PageModel.collection.updateOne(
            { _id: page._id },
            {
                $set: {
                    "draftLayout.0.settings.bannerImage": {
                        source: { kind: "url", url: "/draft.png" },
                        alt: "Draft",
                    },
                },
            },
        );
        const response = await post();
        expect(response.status).toBe(409);
        expect((await response.json()).error.code).toBe("draft_conflict");
        expect(deleteMedia).toHaveBeenCalledWith("new-picture", domain._id);
        expect(
            await PageTextEditModel.countDocuments({ domain: domain._id }),
        ).toBe(0);
    });
    it("preserves unedited settings BSON and shared-map metadata", async () => {
        const identity = new ObjectId();
        const metadata = {
            identity,
            timestamp: new Date("2026-01-01"),
            bytes: Buffer.from([1, 2, 3]),
        };
        await PageModel.collection.updateOne(
            { _id: page._id },
            {
                $set: {
                    "layout.0.settings.metadata": metadata,
                    "draftLayout.0.settings.metadata": metadata,
                },
            },
        );
        expect((await post()).status).toBe(200);
        const saved: any = await PageModel.collection.findOne({
            _id: page._id,
        });
        expect(BSON.serialize(saved.layout[0].settings.metadata)).toEqual(
            BSON.serialize(metadata),
        );
        await DomainModel.collection.updateOne(
            { _id: domain._id },
            {
                $set: {
                    "sharedWidgets.anahataHeader.metadata": metadata,
                    "draftSharedWidgets.anahataHeader.metadata": metadata,
                },
            },
        );
        const shared = await post(
            [change(initial(true), picture("mark"), "logoSource")],
            { target: target(true) },
        );
        expect(shared.status).toBe(200);
        const site: any = await DomainModel.collection.findOne({
            _id: domain._id,
        });
        expect(
            BSON.serialize(site.sharedWidgets.anahataHeader.metadata),
        ).toEqual(BSON.serialize(metadata));
        expect(
            site.sharedWidgets.anahataHeader.settings.logoSource.media.mediaId,
        ).toBe("mark");
        expect(
            site.draftSharedWidgets.anahataHeader.settings.logoSource,
        ).toEqual(site.sharedWidgets.anahataHeader.settings.logoSource);
    });
    it.each(["text", "mixed"])(
        "preserves native BSON through a %s settings edit",
        async (kind) => {
            const metadata = {
                identity: new ObjectId(),
                at: new Date("2026-02-03"),
                bytes: Buffer.from([4, 5, 6]),
            };
            await PageModel.collection.updateOne(
                { _id: page._id },
                {
                    $set: {
                        "layout.0.settings.metadata": metadata,
                        "draftLayout.0.settings.metadata": metadata,
                    },
                },
            );
            const words = {
                kind: "text",
                path: "heading",
                before: defaultsFor("anahataHero").heading,
                after: "Updated welcome",
            };
            expect(
                (await post(kind === "mixed" ? [change(), words] : [words]))
                    .status,
            ).toBe(200);
            const saved: any = await PageModel.collection.findOne({
                _id: page._id,
            });
            expect(BSON.serialize(saved.layout[0].settings.metadata)).toEqual(
                BSON.serialize(metadata),
            );
            expect(
                BSON.serialize(saved.draftLayout[0].settings.metadata),
            ).toEqual(BSON.serialize(metadata));
        },
    );

    it("recovers an image source receipt after history settlement was interrupted", async () => {
        const nativeUpdate =
            PageTextEditModel.updateOne.bind(PageTextEditModel);
        jest.spyOn(PageTextEditModel, "updateOne").mockImplementationOnce(
            () => {
                throw new Error("lost acknowledgment");
            },
        );
        expect((await post()).status).toBeGreaterThanOrEqual(500);
        const stored: any = await PageModel.collection.findOne({
            _id: page._id,
        });
        expect(stored.layout[0].settings.bannerImage.source.media.mediaId).toBe(
            "new-picture",
        );
        expect(stored.pageTextEditReceipts).toHaveLength(1);
        (PageTextEditModel.updateOne as jest.Mock).mockImplementation(
            nativeUpdate,
        );
        const rows = await (
            await history(
                request(
                    `/api/content-changes/text/history?pageId=${page.pageId}`,
                ),
            )
        ).json();
        expect(rows.edits).toHaveLength(1);
        expect(rows.edits[0].changes[0].kind).toBe("image");
        expect(
            (await PageModel.collection.findOne({ _id: page._id }))
                ?.pageTextEditReceipts,
        ).toEqual([]);
    });
    it("enforces same-origin, logged-in site-manager and Member Mimic guards", async () => {
        expect(
            (await post(undefined, {}, { origin: "https://foreign.example" }))
                .status,
        ).toBe(403);
        expect(
            (
                await post(
                    undefined,
                    {},
                    { cookie: "courselit.member-mimic=anything" },
                )
            ).status,
        ).toBe(403);
        await UserModel.updateOne(
            { _id: user._id },
            { $set: { permissions: ["course:manage_any"] } },
        );
        expect((await post()).status).toBe(403);
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(null);
        expect((await post()).status).toBe(403);
    });
});
