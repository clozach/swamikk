import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { BSON } from "mongodb";
import { NextRequest } from "next/server";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import PageModel from "@/models/Page";
import { auth } from "@/auth";
import { GET as leaves } from "../text/leaves/route";
import { POST as edit } from "../text/edit/route";
import { GET as history } from "../text/history/route";
import { PageTextEditModel } from "@/services/content-changes/models";
import {
    widgetTextLeaves,
    setTextLeaf,
    textKeyAllowed,
} from "@/services/content-changes/text-leaves";
import * as hero from "../../../../../../packages/page-blocks/src/blocks/anahata-hero/defaults";
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
    deleteMedia: jest.fn(),
}));

const link = { type: "link", attrs: { href: "/p/more", target: "_blank" } };
const richText = {
    type: "doc",
    content: [
        {
            type: "paragraph",
            content: [{ type: "text", text: "Hello there" }],
        },
        {
            type: "paragraph",
            content: [
                { type: "text", text: "Read " },
                { type: "text", text: "more ↗", marks: [link] },
            ],
        },
    ],
};
const linkedParagraphs = [
    {
        text: "Read the guide today",
        linkText: "the guide",
        linkHref: "/p/guide",
    },
];

describe("inline text edits", () => {
    let domain: any, user: any, page: any;
    const request = (
        path: string,
        method = "GET",
        body?: unknown,
        headers = {},
    ) =>
        new NextRequest(`https://site.example${path}`, {
            method,
            headers: {
                domain: domain.name,
                host: "site.example",
                origin: "https://site.example",
                "content-type": "application/json",
                ...headers,
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
    const heroTarget = () => ({
        kind: "page-widget-text",
        pageId: page.pageId,
        widgetId: "hero",
    });
    const text = (path: string, before: string, after: string) => ({
        kind: "text",
        path,
        before,
        after,
    });
    const post = (body: unknown, headers = {}) =>
        edit(request("/api/content-changes/text/edit", "POST", body, headers));
    const listed = async () =>
        (
            await history(
                request(
                    `/api/content-changes/text/history?pageId=${page.pageId}`,
                ),
            )
        ).json();

    beforeEach(async () => {
        const id = randomUUID();
        domain = await DomainModel.create({
            name: `text-edit-${id}`,
            email: `text-${id}@example.com`,
            sharedWidgets: {
                anahataHeader: {
                    name: "anahataHeader",
                    settings: { brandName: "Swami Karma Karuna" },
                },
            },
            draftSharedWidgets: {
                anahataHeader: {
                    name: "anahataHeader",
                    settings: { brandName: "Swami Karma Karuna" },
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
            {
                widgetId: "header",
                name: "anahataHeader",
                shared: true,
                deleteable: false,
            },
            {
                widgetId: "hero",
                name: "anahataHero",
                shared: false,
                settings: {},
            },
            {
                widgetId: "intro",
                name: "rich-text",
                shared: false,
                settings: { text: richText },
            },
        ];
        page = await PageModel.create({
            domain: domain._id,
            pageId: id,
            name: "Home",
            creatorId: id,
            type: "site",
            layout,
            draftLayout: JSON.parse(JSON.stringify(layout)),
        });
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
            user: { email: user.email },
        });
    });

    it("edits and reverses text on the full legacy homepage without recasting other stored blocks", async () => {
        const layouts = JSON.parse(
            readFileSync(
                join(
                    __dirname,
                    "../../section-edits/__tests__/fixtures/legacy-homepage-layouts.json",
                ),
                "utf8",
            ),
        );
        const original = BSON.serialize(layouts);
        await PageModel.collection.updateOne(
            { _id: page._id },
            { $set: layouts },
        );
        const target = {
            kind: "page-widget-text",
            pageId: page.pageId,
            widgetId: "ayr-anahataPrivateSessions",
        };
        const before = layouts.layout.find(
            (widget) => widget.widgetId === target.widgetId,
        ).settings.heading;
        const after = "Reviewed private sessions heading";
        const response = await post({
            target,
            changes: [text("heading", before, after)],
        });
        expect(response.status).toBe(200);
        const { edit: applied } = await response.json();
        for (const layout of [layouts.layout, layouts.draftLayout])
            layout.find(
                (widget) => widget.widgetId === target.widgetId,
            ).settings.heading = after;
        const saved: any = await PageModel.collection.findOne({
            _id: page._id,
        });
        expect(
            BSON.serialize({
                layout: saved.layout,
                draftLayout: saved.draftLayout,
            }),
        ).toEqual(BSON.serialize(layouts));
        expect(saved.__v).toBe(1);
        const reversed = await post({
            target,
            undoOf: applied.editId,
            changes: [text("heading", after, before)],
        });
        expect(reversed.status).toBe(200);
        const restored: any = await PageModel.collection.findOne({
            _id: page._id,
        });
        expect(
            BSON.serialize({
                layout: restored.layout,
                draftLayout: restored.draftLayout,
            }),
        ).toEqual(original);
        expect(restored.__v).toBe(2);
        expect(
            await PageTextEditModel.countDocuments({
                domain: domain._id,
                state: "applied",
            }),
        ).toBe(2);
    });

    it("lists strings, link words and rich-text nodes; never addresses or image sources", async () => {
        const response = await leaves(
            request(`/api/content-changes/text/leaves?pageId=${page.pageId}`),
        );
        expect(response.status).toBe(200);
        const body = await response.json();
        const widget = (id: string) =>
            body.widgets.find((item) => item.widgetId === id);
        expect(widget("hero").leaves).toEqual(
            expect.arrayContaining([
                {
                    path: "heading",
                    value: hero.heading,
                    kind: "text",
                    source: "default",
                },
                expect.objectContaining({ path: "paragraphs.0.text" }),
            ]),
        );
        const paths: string[] = body.widgets.flatMap((item) =>
            item.leaves.map((leaf) => leaf.path),
        );
        expect(
            paths.some((path) => /href|Href|url|Url|\.id$|\.kind$/.test(path)),
        ).toBe(false);
        expect(
            paths.some((path) =>
                /bannerImage|wordmark|photo|logoSource/.test(path),
            ),
        ).toBe(false);
        expect(widget("intro").leaves).toEqual([
            expect.objectContaining({
                path: "text.content.0",
                value: "Hello there",
                kind: "rich-text-node",
                node: richText.content[0],
            }),
            expect.objectContaining({
                path: "text.content.0.content.0.text",
                value: "Hello there",
                kind: "rich-text-leaf",
            }),
            expect.objectContaining({
                path: "text.content.1",
                value: "Read more ↗",
                kind: "rich-text-node",
                node: richText.content[1],
            }),
            expect.objectContaining({
                path: "text.content.1.content.0.text",
                value: "Read ",
            }),
            expect.objectContaining({
                path: "text.content.1.content.1.text",
                value: "more ↗",
            }),
        ]);
        expect(widget("header")).toMatchObject({
            shared: true,
            leaves: expect.arrayContaining([
                expect.objectContaining({
                    path: "brandName",
                    value: "Swami Karma Karuna",
                    source: "settings",
                }),
            ]),
        });
        expect(textKeyAllowed("homeHref")).toBe(false);
        expect(textKeyAllowed("emailLabel")).toBe(true);
        expect(textKeyAllowed("linkText")).toBe(true);
    });

    it("applies a default-derived edit at once, mirrors the draft, and records its changes", async () => {
        const before: any = await PageModel.findById(page._id).lean();
        const response = await post({
            target: heroTarget(),
            changes: [
                text("heading", hero.heading, "Yoga for the whole of life"),
            ],
        });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.kind).toBe("applied");
        expect(body.edit).toMatchObject({
            target: heroTarget(),
            changes: [
                text("heading", hero.heading, "Yoga for the whole of life"),
            ],
            userId: user.userId,
            widgetName: "anahataHero",
            revision: (before.__v || 0) + 1,
        });
        const saved: any = await PageModel.findById(page._id).lean();
        expect(saved.layout[1].settings.heading).toBe(
            "Yoga for the whole of life",
        );
        expect(saved.draftLayout[1].settings.heading).toBe(
            "Yoga for the whole of life",
        );
        expect(saved.__v).toBe((before.__v || 0) + 1);
        const rows = await PageTextEditModel.find({
            domain: domain._id,
        }).lean();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            state: "applied",
            revision: saved.__v,
        });
        expect((await listed()).edits).toEqual([
            expect.objectContaining({ editId: body.edit.editId }),
        ]);
    });

    it("answers stale with the current values instead of overwriting another change", async () => {
        const response = await post({
            target: heroTarget(),
            changes: [text("heading", "not what is stored", "Something else")],
        });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
            error: { code: "stale" },
            current: [{ path: "heading", value: hero.heading }],
        });
        const saved: any = await PageModel.findById(page._id).lean();
        expect(saved.layout[1].settings?.heading).toBeUndefined();
    });

    it("refuses empty text, control characters, unsupported fields and lost or removed link words", async () => {
        const empty = await post({
            target: heroTarget(),
            changes: [text("heading", hero.heading, "   ")],
        });
        expect(empty.status).toBe(400);
        expect((await empty.json()).error.code).toBe("empty_text");
        const control = await post({
            target: heroTarget(),
            changes: [text("heading", hero.heading, "badtext")],
        });
        expect(control.status).toBe(400);
        const address = await post({
            target: heroTarget(),
            changes: [text("ctaHref", "/x", "/y")],
        });
        expect(address.status).toBe(400);
        await PageModel.updateOne(
            { _id: page._id },
            {
                $set: {
                    "layout.1.settings.paragraphs": linkedParagraphs,
                    "draftLayout.1.settings.paragraphs": linkedParagraphs,
                },
            },
        );
        const lost = await post({
            target: heroTarget(),
            changes: [
                text("paragraphs.0.text", "Read the guide today", "Read today"),
            ],
        });
        expect(lost.status).toBe(400);
        expect((await lost.json()).error.code).toBe("link_changed");
        const removed = await post({
            target: heroTarget(),
            changes: [text("paragraphs.0.linkText", "the guide", "  ")],
        });
        expect(removed.status).toBe(400);
        expect((await removed.json()).error.code).toBe("link_changed");
        expect(
            await PageTextEditModel.countDocuments({
                domain: domain._id,
                state: "applied",
            }),
        ).toBe(0);
    });

    it("moves a linked paragraph's words and its link words together as one edit", async () => {
        await PageModel.updateOne(
            { _id: page._id },
            {
                $set: {
                    "layout.1.settings.paragraphs": linkedParagraphs,
                    "draftLayout.1.settings.paragraphs": linkedParagraphs,
                },
            },
        );
        const response = await post({
            target: heroTarget(),
            changes: [
                text(
                    "paragraphs.0.text",
                    "Read the guide today",
                    "Read the handbook tonight",
                ),
                text("paragraphs.0.linkText", "the guide", "the handbook"),
            ],
        });
        expect(response.status).toBe(200);
        const saved: any = await PageModel.findById(page._id).lean();
        expect(saved.layout[1].settings.paragraphs[0]).toEqual({
            text: "Read the handbook tonight",
            linkText: "the handbook",
            linkHref: "/p/guide",
        });
        expect(saved.draftLayout[1].settings.paragraphs[0].linkText).toBe(
            "the handbook",
        );
        const row = (await listed()).edits[0];
        expect(row.changes).toHaveLength(2);
    });

    it("refuses when an unpublished draft already changes the text", async () => {
        await PageModel.updateOne(
            { _id: page._id },
            { $set: { "draftLayout.1.settings.heading": "Draft heading" } },
        );
        const response = await post({
            target: heroTarget(),
            changes: [text("heading", hero.heading, "Published change")],
        });
        expect(response.status).toBe(409);
        expect((await response.json()).error.code).toBe("draft_conflict");
    });

    it("replaces a rich-text paragraph whole, keeping its link, and refuses formatting it cannot keep", async () => {
        const target = {
            kind: "page-widget-text",
            pageId: page.pageId,
            widgetId: "intro",
        };
        const after = {
            type: "paragraph",
            content: [
                { type: "text", text: "Read even " },
                { type: "text", text: "more ↗", marks: [link] },
                { type: "text", text: " today", marks: [{ type: "bold" }] },
            ],
        };
        const response = await post({
            target,
            changes: [
                {
                    kind: "node",
                    path: "text.content.1",
                    before: richText.content[1],
                    after,
                },
            ],
        });
        expect(response.status).toBe(200);
        const saved: any = await PageModel.findById(page._id).lean();
        expect(saved.layout[2].settings.text).toEqual({
            ...richText,
            content: [richText.content[0], after],
        });
        expect(saved.draftLayout[2].settings.text.content[1]).toEqual(after);
        const highlighted = await post({
            target,
            changes: [
                {
                    kind: "node",
                    path: "text.content.0",
                    before: richText.content[0],
                    after: {
                        type: "paragraph",
                        content: [
                            {
                                type: "text",
                                text: "Hello",
                                marks: [{ type: "highlight" }],
                            },
                        ],
                    },
                },
            ],
        });
        expect(highlighted.status).toBe(400);
        expect((await highlighted.json()).error.code).toBe(
            "unsupported_content",
        );
        const asString = await post({
            target,
            changes: [text("text.content.0", "Hello there", "Hi")],
        });
        expect(asString.status).toBe(400);
        const asNode = await post({
            target,
            changes: [
                {
                    kind: "node",
                    path: "text.content.0.content.0.text",
                    before: {},
                    after: { type: "paragraph", content: [] },
                },
            ],
        });
        expect(asNode.status).toBe(400);
    });

    it("edits shared header text on the site, mirrors its draft, and lists it as site-wide history", async () => {
        const response = await post({
            target: {
                kind: "shared-widget-text",
                pageId: page.pageId,
                name: "anahataHeader",
            },
            changes: [text("brandName", "Swami Karma Karuna", "Swami Karuna")],
        });
        expect(response.status).toBe(200);
        const saved: any = await DomainModel.findById(domain._id).lean();
        expect(saved.sharedWidgets.anahataHeader.settings.brandName).toBe(
            "Swami Karuna",
        );
        expect(saved.draftSharedWidgets.anahataHeader.settings.brandName).toBe(
            "Swami Karuna",
        );
        expect((await listed()).edits[0].target.kind).toBe(
            "shared-widget-text",
        );
    });

    it("records an undo as its own row that names the edit it reverses, and reads first-increment rows", async () => {
        const first = await (
            await post({
                target: heroTarget(),
                changes: [text("heading", hero.heading, "Second")],
            })
        ).json();
        const undo = await post({
            target: heroTarget(),
            changes: [text("heading", "Second", hero.heading)],
            undoOf: first.edit.editId,
        });
        expect(undo.status).toBe(200);
        const saved: any = await PageModel.findById(page._id).lean();
        expect(saved.layout[1].settings.heading).toBe(hero.heading);
        await PageTextEditModel.create({
            domain: domain._id,
            editId: randomUUID(),
            pageId: page.pageId,
            target: { ...heroTarget(), path: "kicker" },
            widgetName: "anahataHero",
            changes: [],
            before: "Old kicker",
            after: "New kicker",
            userId: user.userId,
            at: "2026-09-13T00:00:00.000Z",
            revision: 1,
            state: "applied",
        });
        const rows = (await listed()).edits;
        expect(rows).toHaveLength(3);
        expect(rows[0]).toMatchObject({
            undoOf: first.edit.editId,
            changes: [text("heading", "Second", hero.heading)],
        });
        expect(rows[2]).toMatchObject({
            target: heroTarget(),
            changes: [text("kicker", "Old kicker", "New kicker")],
        });
    });

    it("rejects cross-origin writes, non-managers, and malformed change sets", async () => {
        const foreign = await post(
            {
                target: heroTarget(),
                changes: [text("heading", hero.heading, "X")],
            },
            { origin: "https://foreign.example" },
        );
        expect(foreign.status).toBe(403);
        const twice = await post({
            target: heroTarget(),
            changes: [
                text("heading", hero.heading, "X"),
                text("heading", hero.heading, "Y"),
            ],
        });
        expect(twice.status).toBe(400);
        const none = await post({ target: heroTarget(), changes: [] });
        expect(none.status).toBe(400);
        const nested = await post({
            target: {
                kind: "page-widget-text",
                pageId: page.pageId,
                widgetId: "intro",
            },
            changes: [
                {
                    kind: "node",
                    path: "text.content.0",
                    before: richText.content[0],
                    after: richText.content[0],
                },
                text("text.content.0.content.0.text", "Hello there", "Hi"),
            ],
        });
        expect(nested.status).toBe(400);
        const address = await post({
            target: heroTarget(),
            changes: [text("heading", hero.heading, "/p/somewhere")],
        });
        expect(address.status).toBe(400);
        const prototype = await post({
            target: {
                kind: "shared-widget-text",
                pageId: page.pageId,
                name: "constructor",
            },
            changes: [text("brandName", "x", "y")],
        });
        expect(prototype.status).toBe(404);
        await UserModel.updateOne(
            { _id: user._id },
            { $set: { permissions: ["course:manage_any"] } },
        );
        const denied = await post({
            target: heroTarget(),
            changes: [text("heading", hero.heading, "X")],
        });
        expect(denied.status).toBe(403);
        const listing = await leaves(
            request(`/api/content-changes/text/leaves?pageId=${page.pageId}`),
        );
        expect(listing.status).toBe(403);
    });

    it("writes a default list whole when editing inside it", () => {
        const widget = {
            widgetId: "hero",
            name: "anahataHero",
            shared: false,
            deleteable: true,
            settings: {},
        };
        const linked = hero.paragraphs[0].linkText || "";
        const replacement = `New first paragraph ${linked}`.trim();
        const settings = setTextLeaf(widget, "paragraphs.0.text", replacement);
        expect(Array.isArray(settings.paragraphs)).toBe(true);
        expect((settings.paragraphs as any[])[0].text).toBe(replacement);
        expect((settings.paragraphs as any[]).length).toBe(
            hero.paragraphs.length,
        );
        expect(
            widgetTextLeaves({ ...widget, settings }).find(
                (leaf) => leaf.path === "paragraphs.0.text",
            ),
        ).toMatchObject({ value: replacement, source: "settings" });
    });
});
