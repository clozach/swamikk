import { randomUUID } from "crypto";
import mongoose from "mongoose";
import { isPageWidgetChange } from "@courselit/common-models";
import { PageSchema } from "@courselit/orm-models";
import { collectReferencedMediaIds } from "@courselit/common-logic";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import PageModel from "@/models/Page";
import { ContentChangeModel } from "@/services/content-changes/models";
import {
    createChange,
    getChange,
    prepareRevert,
    reviseChange,
} from "@/services/content-changes/proposals";
import {
    approveChange,
    reconcileChange,
} from "@/services/content-changes/application";
import {
    guardedNativePageSave,
    nativePageBaseline,
} from "@/graphql/pages/guarded-save";
import * as native from "@/graphql/pages/approved-widget";
import { getMedia, sealMedia } from "@/services/medialit";
import * as hero from "../../../../../../packages/page-blocks/src/blocks/anahata-hero/defaults";

jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
    deleteMedia: jest.fn(),
}));
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));

describe("approved native page fields", () => {
    let ctx: any, page: any;
    const input = (field = "heading", text = "A quieter welcome") => ({
        target: {
            kind: "page-widget" as const,
            pageId: page.pageId,
            widgetId: "welcome",
            field,
        },
        patch: { kind: "text" as const, text },
        summary: "Make the welcome clear",
    });
    const live = async (): Promise<any> => {
        const value = await PageModel.findById(page._id).lean();
        if (!value || Array.isArray(value))
            throw new Error("Fixture page missing");
        return value;
    };
    const prepare = async () => {
        const value = await createChange(input(), ctx);
        if (!isPageWidgetChange(value)) throw new Error("Expected page");
        return value;
    };
    beforeEach(async () => {
        jest.restoreAllMocks();
        const id = randomUUID();
        const domain = await DomainModel.create({
            name: `page-${id}`,
            email: `owner-${id}@example.com`,
        });
        const user = await UserModel.create({
            domain: domain._id,
            userId: id,
            email: domain.email,
            active: true,
            permissions: ["site:manage"],
            unsubscribeToken: id,
        });
        ctx = { subdomain: domain, user };
        const widget = {
            widgetId: "welcome",
            name: "anahataHero",
            shared: false,
            settings: {
                type: "site",
                verticalPadding: 20,
                bannerMode: { kind: "social-rotation" },
            },
        };
        page = await PageModel.create({
            domain: domain._id,
            pageId: id,
            type: "site",
            name: "Welcome",
            creatorId: user.userId,
            deleteable: true,
            layout: [widget],
            draftLayout: [
                {
                    ...widget,
                    settings: {
                        ...widget.settings,
                        ctaCaption: "Unpublished button wording",
                    },
                },
            ],
            title: "Published title",
            draftTitle: "Unpublished title",
        });
    });
    it("prepares without page/domain writes and applies only the reviewed leaf, once", async () => {
        const before = await live(),
            domainBefore = await DomainModel.findById(ctx.subdomain._id).lean();
        const proposed = await prepare();
        expect(await live()).toEqual(before);
        expect(proposed.preview.before.defaultDerived).toBe(true);
        await Promise.all([
            approveChange(proposed.id, 1, proposed.previewHash, ctx),
            approveChange(proposed.id, 1, proposed.previewHash, ctx),
        ]);
        const result = await reconcileChange(proposed.id, ctx),
            after = await live();
        expect(result.state.kind).toBe("applied");
        expect(result.approvals).toHaveLength(1);
        expect(after.__v).toBe(1);
        expect(after.layout[0]).toEqual({
            ...before.layout[0],
            settings: {
                ...before.layout[0].settings,
                heading: input().patch.text,
            },
        });
        expect(after.draftLayout[0]).toEqual({
            ...before.draftLayout[0],
            settings: {
                ...before.draftLayout[0].settings,
                heading: input().patch.text,
            },
        });
        expect(after.draftTitle).toBe(before.draftTitle);
        expect(after.title).toBe(before.title);
        expect(await DomainModel.findById(ctx.subdomain._id).lean()).toEqual(
            domainBefore,
        );
        expect(after.contentChangeReceipt.outcome).toBe("applied");
        const OrmPage =
            mongoose.models.PageReceiptRegression ||
            mongoose.model("PageReceiptRegression", PageSchema, "pages");
        expect((await OrmPage.findById(page._id)).contentChangeReceipt).toEqual(
            after.contentChangeReceipt,
        );
        await approveChange(proposed.id, 1, proposed.previewHash, ctx);
        expect((await live()).__v).toBe(1);
    });
    it("rejects unpublished selected-field conflicts and whole-widget replacement payloads", async () => {
        await PageModel.updateOne(
            { _id: page._id },
            { $set: { "draftLayout.0.settings.heading": "Private draft" } },
        );
        await expect(prepare()).rejects.toMatchObject({
            code: "draft_conflict",
        });
        await expect(
            createChange(
                { ...input(), patch: { kind: "restore-widget", settings: {} } },
                ctx,
            ),
        ).rejects.toThrow();
        expect(
            await ContentChangeModel.countDocuments({
                domain: ctx.subdomain._id,
            }),
        ).toBe(0);
    });
    it("recovery restores default absence while keeping unrelated unpublished fields", async () => {
        const proposed = await prepare();
        await approveChange(proposed.id, 1, proposed.previewHash, ctx);
        const recovery = await prepareRevert(proposed.id, 1, ctx);
        expect(recovery.state.kind).toBe("proposed");
        expect((await live()).layout[0].settings.heading).toBe(
            input().patch.text,
        );
        await approveChange(recovery.id, 1, recovery.previewHash, ctx);
        const after = await live();
        expect(after.layout[0].settings.heading).toBeUndefined();
        expect(after.draftLayout[0].settings.heading).toBeUndefined();
        expect(after.draftLayout[0].settings.ctaCaption).toBe(
            "Unpublished button wording",
        );
    });
    it("fences an old native builder save after approval, and makes an old preview stale after a native save", async () => {
        const nativePage = await PageModel.findById(page._id),
            baseline = nativePageBaseline(nativePage);
        nativePage.draftTitle = "Later builder title";
        const proposed = await prepare();
        await approveChange(proposed.id, 1, proposed.previewHash, ctx);
        await expect(
            guardedNativePageSave(nativePage, baseline),
        ).rejects.toMatchObject({ code: "stale" });
        const next = await createChange(
            input("heading", "Second welcome"),
            ctx,
        );
        const fresh = await PageModel.findById(page._id),
            freshBaseline = nativePageBaseline(fresh);
        fresh.draftTitle = "New native draft";
        await guardedNativePageSave(fresh, freshBaseline);
        expect(
            (await approveChange(next.id, 1, next.previewHash, ctx)).state.kind,
        ).toBe("stale");
        expect((await live()).draftTitle).toBe("New native draft");
        await expect(prepareRevert(proposed.id, 1, ctx)).rejects.toMatchObject({
            code: "stale",
        });
    });
    it("reconciles a lost response from the native receipt, preserving it through a later native edit", async () => {
        const apply = native.applyApprovedPageWidget;
        jest.spyOn(native, "applyApprovedPageWidget").mockImplementationOnce(
            async (...args) => {
                await apply(...args);
                throw new Error("Response lost");
            },
        );
        const proposed = await prepare();
        expect(
            (await approveChange(proposed.id, 1, proposed.previewHash, ctx))
                .state.kind,
        ).toBe("applied");
        const current = await PageModel.findById(page._id),
            baseline = nativePageBaseline(current);
        current.draftTitle = "Another draft";
        await guardedNativePageSave(current, baseline);
        expect((await live()).contentChangeReceipt.outcome).toBe("applied");
        expect((await reconcileChange(proposed.id, ctx)).state.kind).toBe(
            "applied",
        );
    });
    it("fences an interrupted write so a delayed old provider-independent application cannot land", async () => {
        const apply = native.applyApprovedPageWidget;
        jest.spyOn(native, "applyApprovedPageWidget").mockRejectedValueOnce(
            new Error("Interrupted before save"),
        );
        const proposed = await prepare();
        const result = await approveChange(
            proposed.id,
            1,
            proposed.previewHash,
            ctx,
        );
        expect(result.state.kind).toBe("failed");
        const after = await live();
        expect(after.layout[0].settings.heading).toBeUndefined();
        expect(after.contentChangeReceipt.outcome).toBe("cancelled");
        await expect(
            apply(proposed.target, proposed, "delayed", ctx),
        ).rejects.toMatchObject({ code: "stale" });
    });
    it("retains uncertain audit and lock when the original page disappeared", async () => {
        const proposed = await prepare();
        jest.spyOn(native, "applyApprovedPageWidget").mockImplementationOnce(
            async () => {
                await PageModel.deleteOne({ _id: page._id });
                throw new Error("Page removed");
            },
        );
        const result = await approveChange(
            proposed.id,
            1,
            proposed.previewHash,
            ctx,
        );
        expect(result.state.kind).toBe("uncertain");
        expect((await getChange(proposed.id, ctx)).activeTarget).toBe(
            `page:${page._id}`,
        );
        expect((await reconcileChange(proposed.id, ctx)).state.kind).toBe(
            "uncertain",
        );
    });
    it("rejects a page re-created under the same public ID and changed published rendering context", async () => {
        const proposed = await prepare(),
            before = await live();
        await PageModel.deleteOne({ _id: page._id });
        delete before._id;
        await PageModel.create(before);
        expect(
            (await approveChange(proposed.id, 1, proposed.previewHash, ctx))
                .state.kind,
        ).toBe("stale");
        const fresh = await prepare();
        ctx.subdomain.typefaces = [
            { family: "Changed", url: "https://example.com/font.woff" },
        ];
        expect(
            (await approveChange(fresh.id, 1, fresh.previewHash, ctx)).state
                .kind,
        ).toBe("stale");
    });
    it("rejects stale version/hash, cross-tenant, missing permission and Mimic", async () => {
        const proposed = await prepare();
        await expect(
            approveChange(proposed.id, 1, "0".repeat(64), ctx),
        ).rejects.toMatchObject({ code: "conflict" });
        await expect(prepareRevert(proposed.id, 1, ctx)).rejects.toThrow();
        for (const bad of [
            { ...ctx, memberMimic: {} },
            { ...ctx, user: { ...ctx.user.toObject(), permissions: [] } },
            { ...ctx, subdomain: { _id: new mongoose.Types.ObjectId() } },
        ])
            await expect(createChange(input(), bad)).rejects.toMatchObject({
                code: "forbidden",
            });
        const revised = await reviseChange(
            proposed.id,
            1,
            { kind: "text", text: "Revised welcome" },
            "Clearer welcome",
            ctx,
        );
        expect(revised.history).toHaveLength(1);
        await expect(
            approveChange(proposed.id, 1, proposed.previewHash, ctx),
        ).rejects.toMatchObject({ code: "conflict" });
    });
    it("keeps the same target lock through a page rename until the applied receipt is reconciled", async () => {
        const proposed = await prepare();
        const update =
            ContentChangeModel.findOneAndUpdate.bind(ContentChangeModel);
        jest.spyOn(ContentChangeModel, "findOneAndUpdate").mockImplementation(((
            filter,
            ...args
        ) => {
            if (filter["state.operationId"])
                throw new Error("Settlement database response unavailable");
            return update(filter, ...args);
        }) as any);
        await expect(
            approveChange(proposed.id, 1, proposed.previewHash, ctx),
        ).rejects.toThrow();
        jest.restoreAllMocks();
        expect((await live()).contentChangeReceipt.outcome).toBe("applied");
        const renamed = `renamed-${page.pageId}`;
        await PageModel.updateOne(
            { _id: page._id },
            { $set: { pageId: renamed } },
        );
        const second = await createChange(
            {
                ...input("heading", "Second edit"),
                target: { ...input().target, pageId: renamed },
            },
            ctx,
        );
        await expect(
            approveChange(second.id, 1, second.previewHash, ctx),
        ).rejects.toMatchObject({ code: "target_busy" });
        expect((await reconcileChange(proposed.id, ctx)).state.kind).toBe(
            "applied",
        );
        expect(
            (await approveChange(second.id, 1, second.previewHash, ctx)).state
                .kind,
        ).toBe("applied");
    });
    it("revalidates private/changed image authority and retains both native images in audit for recovery", async () => {
        const media = (mediaId: string) => ({
            mediaId,
            group: ctx.subdomain.name,
            access: "public",
            mimeType: "image/jpeg",
            file: `https://media.example/${mediaId}.jpg`,
            originalFileName: `${mediaId}.jpg`,
            size: 100,
        });
        (getMedia as jest.Mock).mockImplementation(async (id) => media(id));
        (sealMedia as jest.Mock).mockImplementation(async (id) => media(id));
        const old = media("old-image");
        await PageModel.updateOne(
            { _id: page._id },
            {
                $set: {
                    "layout.0.settings.bannerImage": {
                        source: { kind: "media", media: old },
                        alt: "Before",
                    },
                    "draftLayout.0.settings.bannerImage": {
                        source: { kind: "media", media: old },
                        alt: "Before",
                    },
                },
            },
        );
        const proposed = await createChange(
            {
                ...input("bannerImage"),
                patch: { kind: "image", mediaId: "new-image", alt: "After" },
            },
            ctx,
        );
        if (!isPageWidgetChange(proposed)) throw new Error("Page expected");
        expect(proposed.preview.after.rotatingFallback).toBe(true);
        (getMedia as jest.Mock).mockResolvedValueOnce({
            ...media("new-image"),
            access: "private",
        });
        expect(
            (await approveChange(proposed.id, 1, proposed.previewHash, ctx))
                .state.kind,
        ).toBe("failed");
        expect(
            (await live()).layout[0].settings.bannerImage.source.media.mediaId,
        ).toBe("old-image");
        const fresh = await createChange(
            {
                ...input("bannerImage"),
                patch: { kind: "image", mediaId: "new-image", alt: "After" },
            },
            ctx,
        );
        expect(
            (await approveChange(fresh.id, 1, fresh.previewHash, ctx)).state
                .kind,
        ).toBe("applied");
        const ids = await collectReferencedMediaIds(String(ctx.subdomain._id));
        expect(ids.has("old-image")).toBe(true);
        expect(ids.has("new-image")).toBe(true);
        const unrelated = await collectReferencedMediaIds(
            String(new mongoose.Types.ObjectId()),
        );
        expect(unrelated.has("old-image")).toBe(false);
        expect((await live()).layout[0].settings.bannerMode).toEqual({
            kind: "social-rotation",
        });
        const recovery = await prepareRevert(fresh.id, 1, ctx);
        expect(
            (await approveChange(recovery.id, 1, recovery.previewHash, ctx))
                .state.kind,
        ).toBe("applied");
        expect((await live()).layout[0].settings.bannerImage.alt).toBe(
            "Before",
        );
        expect(hero.heading).toBeTruthy();
    });
});
