import mongoose from "mongoose";
import { randomUUID } from "crypto";
import PageModel from "@/models/Page";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import { updatePage, publish, deleteBlock } from "../logic";
import { pageWriteFilter } from "@/services/content-changes/page-guard";
import { nativePageBaseline, guardedNativePageSave } from "../guarded-save";
import { createChange } from "@/services/content-changes/proposals";
import { approveChange } from "@/services/content-changes/application";
import * as nativeWidget from "../approved-widget";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
    deleteMedia: jest.fn(),
}));

let ctx: any, raw: any;
const current = () => PageModel.collection.findOne({ _id: raw._id });
beforeEach(async () => {
    jest.restoreAllMocks();
    const key = randomUUID();
    const domain = await DomainModel.create({
        name: key,
        email: `${key}@example.com`,
        sharedWidgets: {},
        draftSharedWidgets: {},
        typefaces: [],
        draftTypefaces: [],
    });
    const user = await UserModel.create({
        userId: key,
        domain: domain._id,
        email: `${key}@example.com`,
        active: true,
        permissions: ["site:manage"],
        unsubscribeToken: key,
    });
    ctx = { subdomain: domain, user };
    raw = {
        _id: new mongoose.Types.ObjectId(),
        domain: domain._id,
        pageId: key,
        type: "site",
        name: "Legacy page",
        creatorId: key,
        layout: [
            {
                widgetId: "one",
                name: "rich-text",
                settings: { text: "$literal text" },
            },
        ],
        draftLayout: [
            { widgetId: "one", name: "rich-text", settings: { text: "Draft" } },
        ],
        title: "Original title",
    };
    // Bypass schema defaults exactly as a legacy stored page does.
    await PageModel.collection.insertOne(raw);
});

test("native title save accepts legacy raw widgets and preserves untouched raw layout/default absence", async () => {
    await updatePage({
        context: ctx,
        pageId: raw.pageId,
        title: "Reviewed draft",
    });
    const after: any = await current();
    expect(after.draftTitle).toBe("Reviewed draft");
    expect(after.__v).toBe(1);
    expect(after.layout).toEqual(raw.layout);
    expect(after.draftLayout).toEqual(raw.draftLayout);
    for (const field of ["deleted", "deleteable", "robotsAllowed", "draftOnly"])
        expect(Object.prototype.hasOwnProperty.call(after, field)).toBe(false);
});

test("a raw legacy filter survives the actual Mongoose query caster", async () => {
    const baseline: any = await PageModel.findById(raw._id).lean();
    const result: any = await PageModel.findOneAndUpdate(
        pageWriteFilter(baseline),
        { $set: { draftTitle: "Approved field" }, $inc: { __v: 1 } },
        { new: true },
    ).lean();
    expect(result?.draftTitle).toBe("Approved field");
    expect((await current())?.layout).toEqual(raw.layout);
});

test("legacy publish and block deletion use the same stored baseline", async () => {
    await publish(raw.pageId, ctx);
    const published: any = await current();
    expect(published.layout[0].settings.text).toBe("Draft");
    expect(published.__v).toBe(1);
    await deleteBlock({ context: ctx, pageId: raw.pageId, blockId: "one" });
    const removed: any = await current();
    expect(removed.draftLayout).toEqual([]);
    expect(removed.layout).toEqual(published.layout);
    expect(removed.__v).toBe(2);
});

test.each([
    ["title", "Competing title"],
    ["layout.0.settings.text", "Competing content"],
    ["layout.0._id", new mongoose.Types.ObjectId()],
    ["layout.0.unmodeledMetadata", "Preserve raw unknown value"],
    ["draftTitle", null],
    ["robotsAllowed", true],
])(
    "rejects a competing raw %s edit without a revision increment",
    async (field, value) => {
        const page: any = await PageModel.findById(raw._id).lean();
        const baseline = nativePageBaseline(page);
        page.draftDescription = "Older reviewed save";
        await PageModel.collection.updateOne(
            { _id: raw._id },
            { $set: { [field as string]: value } },
        );
        const intervening = await current();
        expect(intervening?.__v).toBeUndefined();
        await expect(
            guardedNativePageSave(page, baseline),
        ).rejects.toMatchObject({ code: "stale" });
        expect(await current()).toEqual(intervening);
    },
);

test("explicit null and field absence remain distinct in both directions", async () => {
    await PageModel.collection.updateOne(
        { _id: raw._id },
        { $set: { draftDescription: null } },
    );
    const baseline: any = await PageModel.findById(raw._id).lean();
    await PageModel.collection.updateOne(
        { _id: raw._id },
        { $unset: { draftDescription: 1 } },
    );
    const result = await PageModel.findOneAndUpdate(pageWriteFilter(baseline), {
        $inc: { __v: 1 },
    });
    expect(result).toBeNull();
    expect((await current())?.__v).toBeUndefined();
});

test("an explicit social-image clear is staged from absence and publishes as an unset", async () => {
    const image = {
        mediaId: "published-cover",
        originalFileName: "cover.jpg",
        mimeType: "image/jpeg",
        size: 1,
        access: "public",
        file: "https://media.example/cover.jpg",
    };
    await PageModel.collection.updateOne(
        { _id: raw._id },
        { $set: { socialImage: image } },
    );
    await updatePage({ context: ctx, pageId: raw.pageId, socialImage: null });
    expect((await current())?.draftSocialImage).toBeNull();
    expect((await current())?.socialImage).toEqual(image);
    await publish(raw.pageId, ctx);
    const after: any = await current();
    expect(Object.prototype.hasOwnProperty.call(after, "socialImage")).toBe(
        false,
    );
    expect(after.draftSocialImage).toBeNull();
});

test("native explicit undefined unsets an existing null rather than recasting it as null", async () => {
    await PageModel.collection.updateOne(
        { _id: raw._id },
        { $set: { draftSocialImage: null } },
    );
    const page: any = await PageModel.findById(raw._id).lean();
    const baseline = nativePageBaseline(page);
    page.draftSocialImage = undefined;
    await guardedNativePageSave(page, baseline);
    expect(
        Object.prototype.hasOwnProperty.call(
            await current(),
            "draftSocialImage",
        ),
    ).toBe(false);
});

test("stored widget IDs and literal dollar strings are retained; array reordering is fenced", async () => {
    const layout = [
        { ...raw.layout[0], _id: new mongoose.Types.ObjectId() },
        {
            widgetId: "two",
            name: "rich-text",
            _id: new mongoose.Types.ObjectId(),
            settings: { text: "Second" },
        },
    ];
    await PageModel.collection.updateOne(
        { _id: raw._id },
        { $set: { layout, title: "$draftTitle" } },
    );
    await updatePage({ context: ctx, pageId: raw.pageId, title: "Reviewed" });
    expect((await current())?.layout).toEqual(layout);
    expect((await current())?.title).toBe("$draftTitle");
    const baseline: any = await PageModel.findById(raw._id).lean();
    await PageModel.collection.updateOne(
        { _id: raw._id },
        { $set: { layout: [...layout].reverse() } },
    );
    expect(
        await PageModel.findOneAndUpdate(pageWriteFilter(baseline), {
            $inc: { __v: 1 },
        }),
    ).toBeNull();
    expect((await current())?.__v).toBe(1);
});

test.each([false, true])(
    "approved legacy widget apply/recovery works with raw arrays (interrupted=%s)",
    async (interrupted) => {
        const widget = {
            widgetId: "one",
            name: "anahataHero",
            settings: {
                heading: "Original heading",
                type: "site",
                verticalPadding: 20,
                bannerMode: { kind: "social-rotation" },
            },
        };
        await PageModel.collection.updateOne(
            { _id: raw._id },
            { $set: { layout: [widget], draftLayout: [widget] } },
        );
        const change = await createChange(
            {
                target: {
                    kind: "page-widget",
                    pageId: raw.pageId,
                    widgetId: "one",
                    field: "heading",
                },
                patch: { kind: "text", text: "Reviewed heading" },
                summary: "Legacy welcome",
            },
            ctx,
        );
        if (interrupted)
            jest.spyOn(
                nativeWidget,
                "applyApprovedPageWidget",
            ).mockRejectedValueOnce(Error("Interrupted before CAS"));
        const result = await approveChange(
            change.id,
            change.version,
            change.previewHash,
            ctx,
        );
        expect(result.state.kind).toBe(interrupted ? "failed" : "applied");
        const after: any = await current();
        expect(after.__v).toBe(1);
        expect(after.contentChangeReceipt.outcome).toBe(
            interrupted ? "cancelled" : "applied",
        );
        expect(after.layout[0].settings.heading).toBe(
            interrupted ? "Original heading" : "Reviewed heading",
        );
        const frozen = await current();
        if (interrupted)
            await expect(
                approveChange(
                    change.id,
                    change.version,
                    change.previewHash,
                    ctx,
                ),
            ).rejects.toMatchObject({ code: "conflict" });
        else
            await approveChange(
                change.id,
                change.version,
                change.previewHash,
                ctx,
            );
        expect(await current()).toEqual(frozen);
    },
);
