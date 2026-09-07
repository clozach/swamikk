import {
    pageWidgetFields,
    pageWidgetSnapshot,
    patchPageWidget,
    mirrorPageWidgetValue,
} from "@/services/content-changes/page-fields";
import {
    resolvePageImage,
    verifyPageImage,
} from "@/services/content-changes/page-media";
import * as defaults from "../../../../../../packages/page-blocks/src/blocks/anahata-hero/defaults";
import type { WidgetInstance } from "@courselit/common-models";
const hero = (settings: Record<string, unknown> = {}): WidgetInstance => ({
    widgetId: "stable-hero",
    name: "anahataHero",
    shared: false,
    deleteable: true,
    settings,
});
const media = {
    mediaId: "image",
    group: "tenant",
    access: "public",
    mimeType: "image/jpeg",
    file: "https://media.example/image/main.jpg",
    thumbnail: "https://media.example/image/thumb.jpg",
    originalFileName: "image.jpg",
    size: 123,
};
const ctx = { subdomain: { _id: "domain", name: "tenant" } } as any;
it("exposes default-derived text and fallback image without rewriting storage", () => {
    const widget = hero();
    const before = JSON.stringify(widget);
    expect(pageWidgetSnapshot(widget, "heading")).toMatchObject({
        fieldValue: defaults.heading,
        defaultDerived: true,
    });
    expect(pageWidgetSnapshot(widget, "bannerImage").fieldValue).toEqual(
        defaults.bannerImage,
    );
    expect(JSON.stringify(widget)).toBe(before);
    expect(() =>
        patchPageWidget(widget, "heading", {
            kind: "text",
            text: defaults.heading,
        }),
    ).toThrow("already shown");
});
it("edits a default-derived paragraph while preserving the other paragraphs and linked words", () => {
    const widget = hero({
        bannerMode: { kind: "social-rotation" },
        groundColor: "cream",
    });
    const after = patchPageWidget(widget, "paragraph:1", {
        kind: "text",
        text: "A clearer description.",
    });
    expect(after.widgetId).toBe(widget.widgetId);
    expect((after.settings!.paragraphs as any[])[0]).toEqual(
        defaults.paragraphs[0],
    );
    expect((after.settings!.paragraphs as any[])[2]).toEqual(
        defaults.paragraphs[2],
    );
    expect(after.settings!.bannerMode).toEqual({ kind: "social-rotation" });
    expect(() =>
        patchPageWidget(widget, "paragraph:0", {
            kind: "text",
            text: "Removed the existing linked words.",
        }),
    ).toThrow("linked words");
});
it("never accepts shared blocks, invented paths, structural settings or mismatched kinds", () => {
    expect(pageWidgetFields({ ...hero(), shared: true })).toEqual([]);
    for (const field of [
        "__proto__",
        "settings.constructor",
        "bannerMode",
        "paragraph:99",
    ])
        expect(() =>
            patchPageWidget(hero(), field, { kind: "text", text: "x" }),
        ).toThrow();
    expect(() =>
        patchPageWidget(
            hero(),
            "heading",
            { kind: "image", mediaId: "image", alt: "" },
            media,
        ),
    ).toThrow("field type");
    expect(() =>
        patchPageWidget(hero(), "heading", {
            kind: "restore-widget",
            settings: { html: "unsafe" },
        }),
    ).toThrow("Recovery settings");
});
it("marks a rotating banner replacement as a fallback while leaving rotation configured", () => {
    const widget = hero({ bannerMode: { kind: "social-rotation" } });
    const value = { source: { kind: "media", media }, alt: "Retreat garden" };
    const after = patchPageWidget(
        widget,
        "bannerImage",
        { kind: "image", mediaId: "image", alt: "Retreat garden" },
        value,
    );
    expect(pageWidgetSnapshot(after, "bannerImage")).toMatchObject({
        rotatingFallback: true,
        fieldValue: value,
    });
    expect(after.settings!.bannerMode).toEqual({ kind: "social-rotation" });
});
it("mirrors one paragraph without overwriting a different unpublished paragraph, including recovery to defaults", () => {
    const draft = hero({
        paragraphs: defaults.paragraphs.map((p, i) =>
            i === 2 ? { ...p, text: "Unpublished work" } : p,
        ),
        groundColor: "unpublished color",
    });
    const applied = patchPageWidget(hero(), "paragraph:1", {
        kind: "text",
        text: "Approved text",
    });
    const updated = mirrorPageWidgetValue(draft, applied, "paragraph:1");
    expect((updated.settings!.paragraphs as any[])[2].text).toBe(
        "Unpublished work",
    );
    expect(updated.settings!.groundColor).toBe("unpublished color");
    const recovered = mirrorPageWidgetValue(updated, hero(), "paragraph:1");
    expect((recovered.settings!.paragraphs as any[])[1]).toEqual(
        defaults.paragraphs[1],
    );
    expect((recovered.settings!.paragraphs as any[])[2].text).toBe(
        "Unpublished work",
    );
});
it("retains safe text structure and rejects new embedded assets or scripts in rich text", () => {
    const before = {
        type: "doc",
        content: [
            { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        ],
    };
    const widget = { ...hero({ text: before }), name: "rich-text" };
    expect(
        patchPageWidget(widget, "text", {
            kind: "rich-text",
            content: {
                type: "doc",
                content: [
                    {
                        type: "paragraph",
                        content: [{ type: "text", text: "After" }],
                    },
                ],
            },
        }).widgetId,
    ).toBe(widget.widgetId);
    expect(() =>
        patchPageWidget(widget, "text", {
            kind: "rich-text",
            content: {
                type: "doc",
                content: [
                    {
                        type: "html",
                        attrs: { html: "<script>unsafe</script>" },
                    },
                ],
            },
        }),
    ).toThrow("retain existing");
});
it("seals only an owned public image and snapshots the authoritative native image", async () => {
    const deps = {
        get: jest.fn(async () => media),
        seal: jest.fn(async () => media),
    } as any;
    const result = await resolvePageImage("image", "Garden", hero(), ctx, deps);
    expect(result).toMatchObject({
        source: {
            kind: "media",
            media: { mediaId: "image", file: media.file },
        },
        alt: "Garden",
    });
    expect(deps.seal).toHaveBeenCalledWith("image", "domain");
    await verifyPageImage(result, hero(), ctx, deps);
    deps.get.mockResolvedValue({ ...media, access: "private" });
    await expect(verifyPageImage(result, hero(), ctx, deps)).rejects.toThrow(
        "public image",
    );
});
it.each([
    { mediaId: "different-image" },
    { group: "other" },
    { access: "private" },
    { mimeType: "video/mp4" },
    { mimeType: "image/svg+xml" },
])("rejects unsafe image %j before sealing", async (override) => {
    const deps = {
        get: jest.fn(async () => ({ ...media, ...override })),
        seal: jest.fn(),
    } as any;
    await expect(
        resolvePageImage("image", "Garden", hero(), ctx, deps),
    ).rejects.toThrow("public image");
    expect(deps.seal).not.toHaveBeenCalled();
});
