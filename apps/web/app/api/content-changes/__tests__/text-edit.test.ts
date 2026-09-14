import { randomUUID } from "crypto";
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
                {
                    type: "text",
                    text: "more",
                    marks: [{ type: "link", attrs: { href: "/p/more" } }],
                },
            ],
        },
    ],
};

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
    const heroTarget = (path: string) => ({
        kind: "page-widget-text",
        pageId: page.pageId,
        widgetId: "hero",
        path,
    });
    const post = (body: unknown, headers = {}) =>
        edit(request("/api/content-changes/text/edit", "POST", body, headers));

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

    it("lists visible strings from settings and defaults, never addresses or image sources", async () => {
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
            {
                path: "text.content.0.content.0.text",
                value: "Hello there",
                kind: "rich-text-leaf",
                source: "settings",
            },
            expect.objectContaining({
                path: "text.content.1.content.0.text",
                value: "Read ",
            }),
            expect.objectContaining({
                path: "text.content.1.content.1.text",
                value: "more",
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
    });

    it("applies a default-derived edit at once, mirrors the draft, and records it", async () => {
        const before: any = await PageModel.findById(page._id).lean();
        const response = await post({
            target: heroTarget("heading"),
            before: hero.heading,
            after: "Yoga for the whole of life",
        });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.kind).toBe("applied");
        expect(body.edit).toMatchObject({
            before: hero.heading,
            after: "Yoga for the whole of life",
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
        const listed = await history(
            request(`/api/content-changes/text/history?pageId=${page.pageId}`),
        );
        expect((await listed.json()).edits).toEqual([
            expect.objectContaining({ editId: body.edit.editId }),
        ]);
    });

    it("answers stale with the current text instead of overwriting another change", async () => {
        const response = await post({
            target: heroTarget("heading"),
            before: "not what is stored",
            after: "Something else",
        });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
            error: { code: "stale" },
            current: hero.heading,
        });
        const saved: any = await PageModel.findById(page._id).lean();
        expect(saved.layout[1].settings?.heading).toBeUndefined();
    });

    it("refuses empty text, control characters, unsupported fields and changed link words", async () => {
        const empty = await post({
            target: heroTarget("heading"),
            before: hero.heading,
            after: "   ",
        });
        expect(empty.status).toBe(400);
        expect((await empty.json()).error.code).toBe("empty_text");
        const control = await post({
            target: heroTarget("heading"),
            before: hero.heading,
            after: "badtext",
        });
        expect(control.status).toBe(400);
        const address = await post({
            target: heroTarget("ctaHref"),
            before: "/x",
            after: "/y",
        });
        expect(address.status).toBe(400);
        await PageModel.updateOne(
            { _id: page._id },
            {
                $set: {
                    "layout.1.settings.paragraphs": [
                        {
                            text: "Read the guide today",
                            linkText: "the guide",
                            linkHref: "/p/guide",
                        },
                    ],
                    "draftLayout.1.settings.paragraphs": [
                        {
                            text: "Read the guide today",
                            linkText: "the guide",
                            linkHref: "/p/guide",
                        },
                    ],
                },
            },
        );
        const link = await post({
            target: heroTarget("paragraphs.0.text"),
            before: "Read the guide today",
            after: "Read today",
        });
        expect(link.status).toBe(400);
        expect((await link.json()).error.code).toBe("link_changed");
        const kept = await post({
            target: heroTarget("paragraphs.0.text"),
            before: "Read the guide today",
            after: "Read the guide tonight",
        });
        expect(kept.status).toBe(200);
        expect(
            await PageTextEditModel.countDocuments({
                domain: domain._id,
                state: "applied",
            }),
        ).toBe(1);
    });

    it("refuses when an unpublished draft already changes the text", async () => {
        await PageModel.updateOne(
            { _id: page._id },
            { $set: { "draftLayout.1.settings.heading": "Draft heading" } },
        );
        const response = await post({
            target: heroTarget("heading"),
            before: hero.heading,
            after: "Published change",
        });
        expect(response.status).toBe(409);
        expect((await response.json()).error.code).toBe("draft_conflict");
    });

    it("edits one rich-text node and keeps the document structure", async () => {
        const response = await post({
            target: {
                kind: "page-widget-text",
                pageId: page.pageId,
                widgetId: "intro",
                path: "text.content.0.content.0.text",
            },
            before: "Hello there",
            after: "Welcome, friend",
        });
        expect(response.status).toBe(200);
        const saved: any = await PageModel.findById(page._id).lean();
        expect(saved.layout[2].settings.text).toEqual({
            ...richText,
            content: [
                {
                    type: "paragraph",
                    content: [{ type: "text", text: "Welcome, friend" }],
                },
                richText.content[1],
            ],
        });
        expect(
            saved.draftLayout[2].settings.text.content[0].content[0].text,
        ).toBe("Welcome, friend");
    });

    it("edits shared header text on the site, mirrors its draft, and lists it as site-wide history", async () => {
        const response = await post({
            target: {
                kind: "shared-widget-text",
                pageId: page.pageId,
                name: "anahataHeader",
                path: "brandName",
            },
            before: "Swami Karma Karuna",
            after: "Swami Karuna",
        });
        expect(response.status).toBe(200);
        const saved: any = await DomainModel.findById(domain._id).lean();
        expect(saved.sharedWidgets.anahataHeader.settings.brandName).toBe(
            "Swami Karuna",
        );
        expect(saved.draftSharedWidgets.anahataHeader.settings.brandName).toBe(
            "Swami Karuna",
        );
        const listed = await (
            await history(
                request(
                    `/api/content-changes/text/history?pageId=${page.pageId}`,
                ),
            )
        ).json();
        expect(listed.edits[0].target.kind).toBe("shared-widget-text");
    });

    it("records an undo as its own row that names the edit it reverses", async () => {
        const first = await (
            await post({
                target: heroTarget("heading"),
                before: hero.heading,
                after: "Second",
            })
        ).json();
        const undo = await post({
            target: heroTarget("heading"),
            before: "Second",
            after: hero.heading,
            undoOf: first.edit.editId,
        });
        expect(undo.status).toBe(200);
        const saved: any = await PageModel.findById(page._id).lean();
        expect(saved.layout[1].settings.heading).toBe(hero.heading);
        const listed = await (
            await history(
                request(
                    `/api/content-changes/text/history?pageId=${page.pageId}`,
                ),
            )
        ).json();
        expect(listed.edits).toHaveLength(2);
        expect(listed.edits[0]).toMatchObject({
            undoOf: first.edit.editId,
            after: hero.heading,
        });
        expect(listed.edits[1]).toMatchObject({ editId: first.edit.editId });
    });

    it("rejects cross-origin writes and non-managers", async () => {
        const foreign = await post(
            { target: heroTarget("heading"), before: hero.heading, after: "X" },
            { origin: "https://foreign.example" },
        );
        expect(foreign.status).toBe(403);
        await UserModel.updateOne(
            { _id: user._id },
            { $set: { permissions: ["course:manage_any"] } },
        );
        const denied = await post({
            target: heroTarget("heading"),
            before: hero.heading,
            after: "X",
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
        ).toMatchObject({
            value: replacement,
            source: "settings",
        });
    });
});
