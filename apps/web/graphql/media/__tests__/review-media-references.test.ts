/** @jest-environment node */
import mongoose from "mongoose";
import { validateTextEdit } from "@/services/content-changes/text-safety";
import {
    collectReferencedMediaIds,
    collectMediaUsage,
    collectMediaIdsFromValue,
    usageHref,
} from "@courselit/common-logic";
import {
    FeedbackSchema,
    ContentChangeSchema,
    PageSchema,
} from "@courselit/orm-models";

const Feedback =
    mongoose.models.ContextualFeedback ||
    mongoose.model("ContextualFeedback", FeedbackSchema);
const Change =
    mongoose.models.ContentChange ||
    mongoose.model("ContentChange", ContentChangeSchema);
const Page = mongoose.models.Page || mongoose.model("Page", PageSchema);
const sectionEdits = () => mongoose.connection.collection("sectionedits");
const textEdits = () => mongoose.connection.collection("pagetextedits");
const domain = new mongoose.Types.ObjectId();
const otherDomain = new mongoose.Types.ObjectId();

afterEach(async () => {
    await Feedback.deleteMany({ domain: { $in: [domain, otherDomain] } });
    await Change.deleteMany({ domain: { $in: [domain, otherDomain] } });
    await sectionEdits().deleteMany({ domain: { $in: [domain, otherDomain] } });
    await textEdits().deleteMany({ domain: { $in: [domain, otherDomain] } });
});

it("keeps admin photos, proposed content and recovery history while excluding another tenant", async () => {
    await Feedback.collection.insertMany([
        {
            domain,
            id: "feedback-1",
            text: "Replace this photo",
            photoMediaIds: ["feedback-photo"],
        },
        {
            domain: otherDomain,
            id: "feedback-other",
            text: "Other school",
            photoMediaIds: ["other-photo"],
        },
    ]);
    await Change.collection.insertMany([
        {
            domain,
            id: "change-1",
            summary: "Review lesson images",
            baseline: { snapshot: { content: { mediaId: "baseline-image" } } },
            patch: { content: { mediaId: "proposed-image" } },
            preview: { after: { mediaId: "preview-image" } },
            history: [
                { baseline: { snapshot: { mediaId: "recovery-image" } } },
            ],
        },
        {
            domain: otherDomain,
            id: "change-other",
            summary: "Other school",
            history: [{ mediaId: "other-recovery" }],
        },
    ]);
    const references = await collectReferencedMediaIds(domain);
    expect(references).toEqual(
        new Set([
            "feedback-photo",
            "baseline-image",
            "proposed-image",
            "preview-image",
            "recovery-image",
        ]),
    );
    const usage = await collectMediaUsage(domain);
    expect(usage.get("feedback-photo")).toEqual([
        {
            entityType: "contextualFeedback",
            entityId: "feedback-1",
            title: "Replace this photo",
            href: "/dashboard/changes",
        },
    ]);
    expect(usage.get("recovery-image")?.[0]).toMatchObject({
        entityType: "contentChange",
        entityId: "change-1",
        href: "/dashboard/changes",
    });
    expect(usage.has("other-photo")).toBe(false);
    expect(usage.has("other-recovery")).toBe(false);
});

it("retains history-only section images across settlement states and isolates tenants", async () => {
    await sectionEdits().insertMany(
        ["applying", "applied", "failed"].map((kind) => ({
            domain,
            editId: `section-${kind}`,
            label: "Photo story",
            target: { pageId: "our-story", widgetId: "photo-story" },
            state: { kind },
            widget: {
                settings: { photos: [{ mediaId: `${kind}-image` }] },
            },
            snapshot: {
                published: {
                    widget: { settings: { mediaId: "original-image" } },
                },
                draft: {
                    kind: "mirrored",
                    widget: { settings: { mediaId: "draft-original-image" } },
                },
            },
        })),
    );
    await sectionEdits().insertOne({
        domain: otherDomain,
        editId: "section-other",
        label: "Another school's story",
        target: { pageId: "other-story" },
        state: { kind: "applied" },
        widget: { settings: { mediaId: "other-section-image" } },
    });

    // These images appear in no current page; only the durable undo records hold them.
    expect(await collectReferencedMediaIds(domain)).toEqual(
        new Set([
            "applying-image",
            "applied-image",
            "failed-image",
            "original-image",
            "draft-original-image",
        ]),
    );
    const usage = await collectMediaUsage(domain);
    expect(usage.get("applied-image")).toEqual([
        {
            entityType: "sectionEdit",
            entityId: "section-applied",
            title: "Photo story",
            href: "/dashboard/page/our-story",
        },
    ]);
    expect(usage.has("other-section-image")).toBe(false);
    expect(await collectReferencedMediaIds(otherDomain)).toEqual(
        new Set(["other-section-image"]),
    );
});

it("links section history to its page without following submitted URLs", () => {
    expect(
        usageHref("sectionEdit", {
            target: {
                pageId: "our/story?next=external",
                url: "https://attacker.invalid",
            },
        }),
    ).toBe("/dashboard/page/our%2Fstory%3Fnext%3Dexternal");
    expect(
        usageHref("sectionEdit", {
            target: { url: "https://attacker.invalid" },
        }),
    ).toBeUndefined();
    expect(
        usageHref("sectionEdit", { target: { pageId: ".." } }),
    ).toBeUndefined();
});

it.each(["section", "text", "proposal"])(
    "retains %s media moved to history during the live page scan",
    async (kind) => {
        const pageRead = jest.spyOn(Page, "find").mockReturnValue({
            lean: () => ({
                cursor: async function* () {
                    // Removal durably saves its snapshot before the page stops holding it.
                    const image = { mediaId: "concurrent-image" };
                    if (kind === "section") {
                        await sectionEdits().insertOne({
                            domain,
                            editId: "concurrent-removal",
                            target: { pageId: "our-story" },
                            state: { kind: "applying" },
                            widget: { settings: image },
                        });
                    } else if (kind === "text") {
                        await textEdits().insertOne({
                            domain,
                            editId: "concurrent-text",
                            changes: [{ before: image }],
                            state: "applying",
                        });
                    } else {
                        await Change.collection.insertOne({
                            domain,
                            id: "concurrent-proposal",
                            baseline: { snapshot: image },
                        });
                    }
                },
            }),
        } as never);
        try {
            expect(await collectReferencedMediaIds(domain)).toEqual(
                new Set(["concurrent-image"]),
            );
        } finally {
            pageRead.mockRestore();
        }
    },
);

it("retains an embedded image held only by a valid rich-text history entry", async () => {
    const image = { type: "image", attrs: { mediaId: "text-history-image" } };
    const before = {
        type: "paragraph",
        content: [{ type: "text", text: "Original words" }, image],
    };
    const after = {
        type: "paragraph",
        content: [{ type: "text", text: "Revised words" }, image],
    };
    // Whole-paragraph text edits accept unchanged opaque media within the paragraph.
    expect(() =>
        validateTextEdit(
            { type: "doc", content: [before] },
            { type: "doc", content: [after] },
        ),
    ).not.toThrow();
    await textEdits().insertOne({
        domain,
        editId: "paragraph-edit",
        pageId: "our-story",
        target: {
            kind: "page-widget-text",
            pageId: "our-story",
            widgetId: "intro",
        },
        widgetName: "rich-text",
        changes: [{ kind: "node", path: "text.content.0", before, after }],
        state: "applied",
    });
    await textEdits().insertOne({
        domain: otherDomain,
        editId: "paragraph-other",
        pageId: "other-story",
        changes: [{ before: { mediaId: "other-text-image" } }],
        state: "applying",
    });
    expect(await collectReferencedMediaIds(domain)).toEqual(
        new Set(["text-history-image"]),
    );
    const usage = await collectMediaUsage(domain);
    expect(usage.get("text-history-image")).toEqual([
        {
            entityType: "pageTextEdit",
            entityId: "paragraph-edit",
            title: "rich-text",
            href: "/dashboard/page/our-story",
        },
    ]);
    expect(usage.has("other-text-image")).toBe(false);
});

it("recognizes only the explicit photo ID array and links to a trusted admin route", () => {
    expect(
        collectMediaIdsFromValue({
            photoMediaIds: ["photo", "", null, 7],
            text: "some unrelated ID",
        }),
    ).toEqual(new Set(["photo"]));
    expect(
        usageHref("contextualFeedback", {
            target: { url: "https://attacker.invalid" },
        }),
    ).toBe("/dashboard/changes");
    expect(usageHref("contentChange", { id: "../../anything" })).toBe(
        "/dashboard/changes",
    );
});
