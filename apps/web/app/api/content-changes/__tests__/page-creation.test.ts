import * as themes from "@/graphql/themes/logic";
import { randomUUID } from "crypto";
import PageModel from "@/models/Page";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import {
    createChange,
    getChange,
    reviseChange,
    rejectChange,
    prepareRevert,
} from "@/services/content-changes/proposals";
import {
    approveChange,
    reconcileChange,
} from "@/services/content-changes/application";
import { isPageCreation } from "@/services/content-changes/page-creation-types";
import {
    getPage,
    getPages,
    publish,
    deletePageInternal,
    updatePage,
    deleteBlock,
} from "@/graphql/pages/logic";
import * as native from "@/graphql/pages/approved-draft";
import { beginAccountClosure } from "../../../../../../packages/common-logic/src/account-lifecycle/gate";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    deleteMedia: jest.fn(),
    sealMedia: jest.fn(),
    getMedia: jest.fn(),
}));
let ctx: any;
const body = {
    type: "doc" as const,
    content: [
        {
            type: "paragraph",
            content: [{ type: "text", text: "A quiet welcome." }],
        },
    ],
};
const input = (pageId = "welcome") => ({
    target: { kind: "page-create" as const, pageId },
    patch: {
        kind: "page-create" as const,
        title: "Welcome",
        content: body,
        intent: "Make a simple welcome page",
        materials: "Approved source words",
    },
    summary: "Create welcome draft",
});
async function prepare(pageId?: string) {
    const change = await createChange(input(pageId), ctx);
    if (!isPageCreation(change)) throw new Error("Expected creation");
    return change;
}
async function apply(pageId?: string) {
    const proposed = await prepare(pageId);
    const result = await approveChange(
        proposed.id,
        1,
        proposed.previewHash,
        ctx,
    );
    return { proposed, result };
}
beforeEach(async () => {
    jest.restoreAllMocks();
    const id = randomUUID();
    const domain = await DomainModel.create({
        name: `creation-${id}`,
        email: `${id}@example.com`,
        sharedWidgets: {},
        draftSharedWidgets: {},
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
test("preparation retains intent and exact text without creating a page or changing shared drafts", async () => {
    const before = JSON.stringify(
        await DomainModel.findById(ctx.subdomain._id),
    );
    const proposed = await prepare();
    expect(proposed.preview.path).toBe("/p/welcome");
    expect(proposed.patch.intent).toBe(input().patch.intent);
    expect(proposed.preview.layout[1].settings?.text).toEqual({
        type: "doc",
        content: [
            {
                type: "heading",
                attrs: { level: 1 },
                content: [{ type: "text", text: "Welcome" }],
            },
            ...body.content,
        ],
    });
    expect(await PageModel.countDocuments({ domain: ctx.subdomain._id })).toBe(
        0,
    );
    expect(JSON.stringify(await DomainModel.findById(ctx.subdomain._id))).toBe(
        before,
    );
    await rejectChange(proposed.id, 1, ctx);
    expect(await PageModel.countDocuments({ domain: ctx.subdomain._id })).toBe(
        0,
    );
});
test("one approval creates a complete hidden native draft and repeated approvals do not duplicate it", async () => {
    const proposed = await prepare();
    const before = JSON.stringify(
        await DomainModel.findById(ctx.subdomain._id),
    );
    await Promise.all([
        approveChange(proposed.id, 1, proposed.previewHash, ctx),
        approveChange(proposed.id, 1, proposed.previewHash, ctx),
    ]);
    const result = await reconcileChange(proposed.id, ctx);
    expect(result.state.kind).toBe("applied");
    expect(result.approvals).toHaveLength(1);
    const page = await PageModel.findById(proposed.baseline.documentId);
    expect(page).toMatchObject({
        draftOnly: true,
        layout: [],
        draftTitle: "Welcome",
        creationReceipt: {
            changeId: proposed.id,
            outcome: "created",
            previewHash: proposed.previewHash,
        },
    });
    expect(JSON.parse(JSON.stringify(page.draftLayout))).toMatchObject(
        proposed.preview.layout,
    );
    expect(await PageModel.countDocuments({ domain: ctx.subdomain._id })).toBe(
        1,
    );
    expect(JSON.stringify(await DomainModel.findById(ctx.subdomain._id))).toBe(
        before,
    );
    await expect(prepareRevert(proposed.id, 1, ctx)).rejects.toMatchObject({
        code: "unsupported_action",
    });
});
test("native public getPage hides the draft; editor listing includes it and explicit publication reveals it", async () => {
    const { proposed } = await apply();
    const publicCtx = { ...ctx, user: undefined };
    expect(await getPage({ id: "welcome", ctx: publicCtx })).toBeUndefined();
    expect(
        await getPage({
            id: "welcome",
            ctx: { ...ctx, user: { ...ctx.user.toObject(), permissions: [] } },
        }),
    ).toBeUndefined();
    expect((await getPages(ctx)).map((page) => page.pageId)).toContain(
        "welcome",
    );
    expect((await getPage({ id: "welcome", ctx }))?.draftTitle).toBe("Welcome");
    // Native reads initialize chrome; refresh its current domain before explicit publication.
    ctx.subdomain = await DomainModel.findById(ctx.subdomain._id);
    await DomainModel.updateOne(
        { _id: ctx.subdomain._id },
        { $set: { draftSharedWidgets: ctx.subdomain.sharedWidgets } },
    );
    await publish("welcome", ctx);
    expect(
        (await getPage({ id: "welcome", ctx: { ...ctx, user: undefined } }))
            ?.title,
    ).toBe("Welcome");
    expect(
        (await PageModel.findById(proposed.baseline.documentId)).draftOnly,
    ).toBe(false);
});
test("pending shared drafts block first publication without promoting or changing any draft", async () => {
    const { proposed } = await apply();
    await DomainModel.updateOne(
        { _id: ctx.subdomain._id },
        {
            $set: {
                draftSharedWidgets: { pending: { privateText: "Unapproved" } },
            },
        },
    );
    const before = JSON.stringify(
        await DomainModel.findById(ctx.subdomain._id),
    );
    await expect(publish("welcome", ctx)).rejects.toThrow(
        "site-wide drafts separately",
    );
    expect(JSON.stringify(await DomainModel.findById(ctx.subdomain._id))).toBe(
        before,
    );
    expect(
        (await PageModel.findById(proposed.baseline.documentId)).draftOnly,
    ).toBe(true);
});
test("wrong version/hash and revised preview cannot approve an older intent", async () => {
    const proposed = await prepare();
    await expect(
        approveChange(proposed.id, 1, "0".repeat(64), ctx),
    ).rejects.toMatchObject({ code: "conflict" });
    const revised = await reviseChange(
        proposed.id,
        1,
        { ...input().patch, title: "New title" },
        "Revised title",
        ctx,
    );
    await expect(
        approveChange(proposed.id, 1, proposed.previewHash, ctx),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
        (await approveChange(revised.id, 2, revised.previewHash, ctx)).state
            .kind,
    ).toBe("applied");
    expect(revised.history).toHaveLength(1);
});
test("actual published appearance changes make the preview stale, even with a stale request domain", async () => {
    const proposed = await prepare();
    await DomainModel.updateOne(
        { _id: ctx.subdomain._id },
        {
            $set: {
                sharedWidgets: {
                    header: { settings: { title: "New published header" } },
                },
            },
        },
    );
    expect(
        (await approveChange(proposed.id, 1, proposed.previewHash, ctx)).state
            .kind,
    ).toBe("stale");
    expect(await PageModel.countDocuments({ domain: ctx.subdomain._id })).toBe(
        0,
    );
});
test("route collisions before and after preparation never overwrite a native page", async () => {
    const proposed = await prepare();
    const page = await PageModel.create({
        domain: ctx.subdomain._id,
        pageId: "welcome",
        name: "Existing",
        creatorId: ctx.user.userId,
        type: "site",
        layout: [],
        draftLayout: [],
    });
    await expect(prepare()).rejects.toMatchObject({ code: "route_collision" });
    expect(
        (await approveChange(proposed.id, 1, proposed.previewHash, ctx)).state
            .kind,
    ).toBe("failed");
    expect((await PageModel.findById(page._id)).name).toBe("Existing");
    expect(
        (await PageModel.findById(proposed.baseline.documentId)).deleted,
    ).toBe(true);
});
test("a lost successful response reconciles by its atomic receipt without a second insert", async () => {
    const original = native.applyApprovedPageDraft;
    jest.spyOn(native, "applyApprovedPageDraft").mockImplementationOnce(
        async (...args) => {
            await original(...args);
            throw new Error("response lost");
        },
    );
    expect((await apply()).result.state.kind).toBe("applied");
    expect(
        await PageModel.countDocuments({
            domain: ctx.subdomain._id,
            deleted: { $ne: true },
        }),
    ).toBe(1);
});
test("recovery cancellation fences a delayed native insert at the same immutable identity", async () => {
    let release!: () => void, entered!: () => void;
    const paused = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const resume = new Promise<void>((resolve) => {
        release = resolve;
    });
    const original = native.applyApprovedPageDraft;
    jest.spyOn(native, "applyApprovedPageDraft").mockImplementationOnce(
        async (...args) => {
            entered();
            await resume;
            return original(...args);
        },
    );
    const proposed = await prepare();
    const applying = approveChange(proposed.id, 1, proposed.previewHash, ctx);
    await paused;
    expect((await reconcileChange(proposed.id, ctx)).state.kind).toBe("failed");
    release();
    await applying;
    expect(
        (await PageModel.findById(proposed.baseline.documentId)).creationReceipt
            .outcome,
    ).toBe("cancelled");
    expect(
        await PageModel.countDocuments({
            domain: ctx.subdomain._id,
            deleted: { $ne: true },
        }),
    ).toBe(0);
    expect((await getPages(ctx)).length).toBe(0);
    expect(
        await getPage({ id: `removed-${proposed.baseline.documentId}`, ctx }),
    ).toBeUndefined();
});
test("unavailable recovery preserves uncertainty and the route lock until a definitive retry", async () => {
    const proposed = await prepare();
    jest.spyOn(native, "applyApprovedPageDraft").mockRejectedValueOnce(
        new Error("interrupted"),
    );
    jest.spyOn(PageModel, "updateOne").mockRejectedValueOnce(
        new Error("unavailable"),
    );
    expect(
        (await approveChange(proposed.id, 1, proposed.previewHash, ctx)).state
            .kind,
    ).toBe("uncertain");
    expect((await getChange(proposed.id, ctx)).activeTarget).toBe(
        "page-route:welcome",
    );
    expect((await reconcileChange(proposed.id, ctx)).state.kind).toBe("failed");
    expect((await getChange(proposed.id, ctx)).activeTarget).toBeUndefined();
});
test("deleted created pages retain erased identity and never expose old text or revive it", async () => {
    const { proposed } = await apply();
    await deletePageInternal(ctx, "welcome");
    const page = await PageModel.findById(proposed.baseline.documentId);
    expect(page).toMatchObject({
        deleted: true,
        layout: [],
        draftLayout: [],
        draftOnly: true,
    });
    expect(page.draftTitle).toBeUndefined();
    expect(await getPage({ id: page.pageId, ctx })).toBeUndefined();
    expect(
        await updatePage({
            context: ctx,
            pageId: page.pageId,
            title: "Revived",
        }),
    ).toBeNull();
    expect((await apply()).result.state.kind).toBe("applied");
    expect((await reconcileChange(proposed.id, ctx)).state.kind).toBe(
        "applied",
    );
});
test("permission, tenant, Mimic and actual closed-account gates reject creation", async () => {
    for (const user of [
        undefined,
        { ...ctx.user.toObject(), permissions: [] },
        { ...ctx.user.toObject(), active: false },
        { ...ctx.user.toObject(), domain: "foreign" },
    ]) {
        await expect(
            createChange(input(), { ...ctx, user }),
        ).rejects.toMatchObject({ code: "forbidden" });
    }
    await expect(
        createChange(input(), { ...ctx, memberMimic: {} }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const proposed = await prepare();
    await beginAccountClosure({
        domainId: String(ctx.subdomain._id),
        userId: ctx.user.userId,
    });
    await expect(prepare("other")).rejects.toMatchObject({
        code: "account_unavailable",
    });
    expect(
        (await approveChange(proposed.id, 1, proposed.previewHash, ctx)).state
            .kind,
    ).toBe("failed");
    expect(
        await PageModel.countDocuments({
            domain: ctx.subdomain._id,
            deleted: { $ne: true },
        }),
    ).toBe(0);
});
test("raw material cannot inject HTML, assets, scripts or privileged layout fields", async () => {
    await expect(
        createChange(
            {
                ...input(),
                patch: {
                    ...input().patch,
                    content: {
                        type: "doc",
                        content: [
                            {
                                type: "image",
                                attrs: { src: "https://example.com/private" },
                            },
                        ],
                    },
                },
            },
            ctx,
        ),
    ).rejects.toBeDefined();
    await expect(
        createChange(
            { ...input(), patch: { ...input().patch, layout: [] } } as any,
            ctx,
        ),
    ).rejects.toBeDefined();
    await expect(createChange(input("../secret"), ctx)).rejects.toBeDefined();
    expect(await PageModel.countDocuments({ domain: ctx.subdomain._id })).toBe(
        0,
    );
});

test("historical result identity cannot read, save, publish or delete blocks on a replacement at the same route", async () => {
    const { proposed } = await apply();
    await deletePageInternal(ctx, "welcome");
    const replacement = await apply();
    const before = JSON.stringify(
        await PageModel.findById(replacement.proposed.baseline.documentId),
    );
    const documentId = proposed.baseline.documentId;
    expect(await getPage({ id: "welcome", documentId, ctx })).toBeUndefined();
    expect(
        await updatePage({
            context: ctx,
            pageId: "welcome",
            documentId,
            title: "Wrong page",
        }),
    ).toBeNull();
    expect(await publish("welcome", ctx, documentId)).toBeNull();
    expect(
        await deleteBlock({
            context: ctx,
            pageId: "welcome",
            documentId,
            blockId: replacement.proposed.preview.layout[1].widgetId!,
        }),
    ).toBeNull();
    expect(
        JSON.stringify(
            await PageModel.findById(replacement.proposed.baseline.documentId),
        ),
    ).toBe(before);
});
test("an existing live page without the new flag keeps native read and draft-save behavior", async () => {
    const page = await PageModel.create({
        domain: ctx.subdomain._id,
        pageId: "legacy",
        type: "site",
        name: "Legacy",
        creatorId: ctx.user.userId,
        layout: [],
        draftLayout: [],
        title: "Live",
    });
    expect(
        (await getPage({ id: "legacy", ctx: { ...ctx, user: undefined } }))
            ?.title,
    ).toBe("Live");
    expect(
        (
            await updatePage({
                context: ctx,
                pageId: "legacy",
                title: "New draft",
            })
        )?.draftTitle,
    ).toBe("New draft");
    expect((await PageModel.findById(page._id)).title).toBe("Live");
});

test("equal persisted font settings can publish despite different subdocument IDs; changed fonts remain pending", async () => {
    const font = {
        section: "body",
        typeface: "Roboto",
        fontWeights: [400],
        case: "captilize",
    };
    await DomainModel.updateOne(
        { _id: ctx.subdomain._id },
        { $set: { typefaces: [font], draftTypefaces: [font] } },
    );
    await apply();
    await publish("welcome", ctx);
    await apply("font-draft");
    await DomainModel.updateOne(
        { _id: ctx.subdomain._id },
        { $set: { draftTypefaces: [{ ...font, typeface: "Georgia" }] } },
    );
    await expect(publish("font-draft", ctx)).rejects.toThrow(
        "site-wide drafts separately",
    );
    expect(
        (
            await PageModel.findOne({
                domain: ctx.subdomain._id,
                pageId: "font-draft",
            })
        ).draftOnly,
    ).toBe(true);
});
test("a pending theme draft is disclosed and cannot be promoted by first page publication", async () => {
    await apply();
    const current = await themes.getTheme(ctx);
    jest.spyOn(themes, "getTheme").mockResolvedValue({
        ...current,
        draftTheme: { ...current.theme, extra: "unpublished" },
    } as any);
    await expect(publish("welcome", ctx)).rejects.toThrow(
        "site-wide drafts separately",
    );
    expect(
        (
            await PageModel.findOne({
                domain: ctx.subdomain._id,
                pageId: "welcome",
            })
        ).draftOnly,
    ).toBe(true);
});

test("two pending proposals at one route serialize their application and never replace the winner", async () => {
    const first = await prepare(),
        second = await prepare();
    let release!: () => void, entered!: () => void;
    const paused = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const resume = new Promise<void>((resolve) => {
        release = resolve;
    });
    const original = native.applyApprovedPageDraft;
    jest.spyOn(native, "applyApprovedPageDraft").mockImplementationOnce(
        async (...args) => {
            entered();
            await resume;
            return original(...args);
        },
    );
    const applying = approveChange(first.id, 1, first.previewHash, ctx);
    await paused;
    await expect(
        approveChange(second.id, 1, second.previewHash, ctx),
    ).rejects.toMatchObject({ code: "target_busy" });
    release();
    expect((await applying).state.kind).toBe("applied");
    expect(
        (await approveChange(second.id, 1, second.previewHash, ctx)).state.kind,
    ).toBe("failed");
    expect(
        await PageModel.countDocuments({
            domain: ctx.subdomain._id,
            deleted: { $ne: true },
        }),
    ).toBe(1);
    expect(
        (
            await PageModel.findOne({
                domain: ctx.subdomain._id,
                pageId: "welcome",
            })
        ).creationReceipt.changeId,
    ).toBe(first.id);
});

test("the native creation helper itself refuses an unapproved or foreign record", async () => {
    const proposed = await prepare();
    const record = await getChange(proposed.id, ctx);
    if (record.target.kind !== "page-create")
        throw new Error("Expected creation");
    await expect(
        native.applyApprovedPageDraft(record as any, "invented", ctx),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
        native.applyApprovedPageDraft(
            { ...record.toObject(), domain: "foreign" } as any,
            "invented",
            ctx,
        ),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await PageModel.countDocuments({ domain: ctx.subdomain._id })).toBe(
        0,
    );
});
