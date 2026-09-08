import { randomUUID, createHash } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { WidgetInstance } from "@courselit/common-models";
import {
    privateSessionsCreation,
    privateSessionsImageDraft,
    privateSessionsHomeDraft,
    privateSessionsFingerprint as hash,
    privateSessionEnquiry,
} from "../../../../.migrations/private-sessions-import";
import provenance from "../../../../public/anahata/private-sessions/provenance.json";
import PageModel from "@/models/Page";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import { createChange } from "@/services/content-changes/proposals";
import { approveChange } from "@/services/content-changes/application";
import { updatePage, publish, getPage } from "@/graphql/pages/logic";
import { contentChangeInputSchema } from "@/services/content-changes/validation";
import { SITE_HEADER_WIDGET, SITE_FOOTER_WIDGET } from "@/config/site-chrome";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    deleteMedia: jest.fn(),
    sealMedia: jest.fn(),
    getMedia: jest.fn(),
}));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const chrome = Object.fromEntries(
    [SITE_HEADER_WIDGET, SITE_FOOTER_WIDGET].map((name) => [
        name,
        {
            name,
            widgetId: `existing-${name}`,
            shared: true,
            deleteable: false,
            settings: { label: "Existing site appearance" },
        },
    ]),
) as Record<string, WidgetInstance>;
let ctx: any;

beforeEach(async () => {
    const id = randomUUID();
    const domain = await DomainModel.create({
        name: `session-import-${id}`,
        email: `${id}@example.com`,
        sharedWidgets: clone(chrome),
        draftSharedWidgets: clone(chrome),
        typefaces: [],
        draftTypefaces: [],
    });
    const user = await UserModel.create({
        domain: domain._id,
        userId: id,
        email: domain.email,
        active: true,
        permissions: ["site:manage"],
        unsubscribeToken: id,
    });
    ctx = { user, subdomain: domain };
});

test("the prepared creation is complete text with local cards, exact accessible package units and an editable mail enquiry", () => {
    const input = contentChangeInputSchema.parse(privateSessionsCreation());
    const json = JSON.stringify(input);
    expect(json).not.toContain('"type":"image"');
    for (const price of [
        "Single session: NZD120.",
        "Five-session package: NZD575 total",
        "Single session: NZD155.",
        "Five-session package: NZD750 total",
    ])
        expect(json).toContain(price);
    expect(json).toContain("including GST");
    expect(json).toContain("/anahata/private-sessions/60-minute-prices.png");
    expect(json).toContain("/anahata/private-sessions/90-minute-prices.png");
    const url = new URL(privateSessionEnquiry());
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("omsatyam@anahata-retreat.org.nz");
    expect(url.searchParams.get("body")).toContain("Time zone:");
    expect(url.searchParams.get("body")).toContain("Phone (optional):");
    expect(url.searchParams.has("bcc")).toBe(false);
});

test("native creation, asset draft and separate publication retain one page and unchanged shared appearance", async () => {
    const proposed = await createChange(privateSessionsCreation(), ctx);
    expect(await PageModel.countDocuments({ domain: ctx.subdomain._id })).toBe(
        0,
    );
    await approveChange(
        proposed.id,
        proposed.version,
        proposed.previewHash,
        ctx,
    );
    await approveChange(
        proposed.id,
        proposed.version,
        proposed.previewHash,
        ctx,
    );
    expect(await PageModel.countDocuments({ domain: ctx.subdomain._id })).toBe(
        1,
    );
    const page = await PageModel.findOne({
        domain: ctx.subdomain._id,
        pageId: "private-sessions",
    });
    const before = clone(page.draftLayout) as WidgetInstance[];
    const bodyId = before.find((widget) => !widget.shared)!.widgetId;
    const next = privateSessionsImageDraft(
        before,
        chrome,
        hash({ layout: before, sharedWidgets: chrome }),
    );
    expect(next.find((widget) => !widget.shared)!.widgetId).toBe(bodyId);
    expect(JSON.stringify(next).match(/"type":"image"/g)).toHaveLength(3);
    await updatePage({
        context: ctx,
        pageId: page.pageId,
        documentId: String(page._id),
        layout: JSON.stringify(next),
    });
    const saved = await PageModel.findById(page._id);
    expect(saved.draftOnly).toBe(true);
    expect(saved.layout).toHaveLength(0);
    expect(
        await getPage({ id: page.pageId, ctx: { ...ctx, user: undefined } }),
    ).toBeUndefined();
    const domain = await DomainModel.findById(ctx.subdomain._id);
    if (!domain) throw new Error("Expected native domain");
    expect(clone(domain.sharedWidgets)).toEqual(chrome);
    expect(clone(domain.draftSharedWidgets)).toEqual(chrome);
    await publish(page.pageId, { ...ctx, subdomain: domain }, String(page._id));
    const published = await PageModel.findById(page._id);
    expect(published.draftOnly).toBe(false);
    expect(JSON.stringify(published.layout)).toContain(
        "/anahata/private-sessions/session-photo.jpg",
    );
    expect(published.creationReceipt.changeId).toBe(proposed.id);
    expect(
        clone((await DomainModel.findById(domain._id))!.sharedWidgets),
    ).toEqual(chrome);
});

test("changed draft text or shared appearance cannot be overwritten with the reviewed image plan", async () => {
    const proposed = await createChange(privateSessionsCreation(), ctx);
    await approveChange(
        proposed.id,
        proposed.version,
        proposed.previewHash,
        ctx,
    );
    const page = await PageModel.findOne({
        domain: ctx.subdomain._id,
        pageId: "private-sessions",
    });
    const layout = clone(page.draftLayout) as WidgetInstance[];
    const approved = hash({ layout, sharedWidgets: chrome });
    const changed = clone(layout);
    changed.find((widget) => !widget.shared)!.settings!.text = {
        type: "doc",
        content: [
            {
                type: "paragraph",
                content: [{ type: "text", text: "Human edit" }],
            },
        ],
    };
    expect(() => privateSessionsImageDraft(changed, chrome, approved)).toThrow(
        "changed",
    );
    expect(() =>
        privateSessionsImageDraft(
            changed,
            chrome,
            hash({ layout: changed, sharedWidgets: chrome }),
        ),
    ).toThrow("no longer matches");
    expect(() => privateSessionsImageDraft(layout, {}, approved)).toThrow(
        "changed",
    );
    expect(clone((await PageModel.findById(page._id)).draftLayout)).toEqual(
        layout,
    );
});

test("the homepage plan changes only the three approved blocks and rejects a newly edited tour", () => {
    const layout: WidgetInstance[] = [
        chrome[SITE_HEADER_WIDGET],
        {
            name: "unrelated",
            widgetId: "human-content",
            shared: false,
            deleteable: true,
            settings: { text: "Keep this content" },
        },
        {
            name: "anahataTour",
            widgetId: "ayr-anahataTour",
            shared: false,
            deleteable: true,
        },
        {
            name: "anahataPrivateSessions",
            widgetId: "ayr-anahataPrivateSessions",
            shared: false,
            deleteable: true,
            settings: {
                buttonAction:
                    "https://www.anahata-retreat.org.nz/stay/private-sessions",
            },
        },
        {
            name: "anahataPosts",
            widgetId: "ayr-anahataPosts",
            shared: false,
            deleteable: true,
            settings: {
                posts: [
                    {
                        id: "anahata-post-kumara-salad",
                        title: "Roasted Vegetable Salad",
                        href: "https://www.anahata-retreat.org.nz/2026/04/roasted-vegetable-salad",
                        thumbnail: {
                            kind: "url",
                            url: "https://www.anahata-retreat.org.nz/wp-content/uploads/2026/04/images-4.jpg",
                            alt: "Roasted Vegetable Salad",
                        },
                    },
                    { id: "unchanged-post", title: "Keep second post" },
                ],
            },
        },
        chrome[SITE_FOOTER_WIDGET],
    ];
    const before = clone(layout);
    const next = privateSessionsHomeDraft(
        layout,
        chrome,
        hash({ layout, sharedWidgets: chrome }),
    );
    expect(layout).toEqual(before);
    expect(next.map((widget) => widget.widgetId)).toEqual(
        layout.map((widget) => widget.widgetId),
    );
    expect(next[0]).toEqual(layout[0]);
    expect(next[1]).toEqual(layout[1]);
    expect(next[5]).toEqual(layout[5]);
    expect(next[2].name).toBe("rich-text");
    expect(JSON.stringify(next[2])).toContain("Open Anahata’s virtual tour");
    expect(JSON.stringify(next[2])).not.toContain("iframe");
    expect(next[3].settings?.buttonAction).toBe("/p/private-sessions");
    const posts = next[4].settings?.posts as any[];
    expect(posts[0].thumbnail).toEqual({
        kind: "url",
        url: "/anahata/post-roasted-vegetable-salad.jpg",
        alt: "Roasted Vegetable Salad",
    });
    expect(posts[1]).toEqual((layout[4].settings?.posts as any[])[1]);
    const edited = clone(layout);
    edited[2].settings = { caption: "A later human edit" };
    expect(() =>
        privateSessionsHomeDraft(
            edited,
            chrome,
            hash({ layout: edited, sharedWidgets: chrome }),
        ),
    ).toThrow("edited settings");
});

test("all copied resources exist as exact local bytes, with no guessed price-card assets", () => {
    expect(provenance.assets).toHaveLength(7);
    for (const asset of provenance.assets) {
        expect(asset.path).toMatch(/^\/anahata\/[a-z0-9/.-]+$/);
        const bytes = readFileSync(
            resolve(process.cwd(), "public", asset.path.slice(1)),
        );
        expect(bytes.length).toBe(asset.bytes);
        expect(
            createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),
        ).toBe(asset.sha256);
    }
});

test("the existing native editor authority still gates this prepared content", async () => {
    await expect(
        createChange(privateSessionsCreation(), {
            ...ctx,
            user: { ...ctx.user.toObject(), permissions: [] },
        }),
    ).rejects.toThrow();
    expect(await PageModel.countDocuments({ domain: ctx.subdomain._id })).toBe(
        0,
    );
});
