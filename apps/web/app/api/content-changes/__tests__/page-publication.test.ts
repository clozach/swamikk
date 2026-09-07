import { randomUUID } from "crypto";
import PageModel from "@/models/Page";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import * as native from "@/graphql/pages/logic";
import * as save from "@/graphql/pages/guarded-save";
import {
    createChange,
    getChange,
    prepareRevert,
    rejectChange,
} from "@/services/content-changes/proposals";
import {
    approveChange,
    reconcileChange,
} from "@/services/content-changes/application";
import { preparePublicationReview } from "@/services/content-changes/page-publication-adapter";
import { isPagePublication } from "@/services/content-changes/page-publication-types";
import { isPageCreation } from "@/services/content-changes/page-creation-types";
import { beginAccountClosure } from "../../../../../../packages/common-logic/src/account-lifecycle/gate";
import {
    contentChangeInputSchema,
    contentChangeActionSchema,
} from "@/services/content-changes/validation";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
    deleteMedia: jest.fn(),
}));
let ctx: any;
const text = (value: string) => ({
    type: "doc" as const,
    content: [
        {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: value }],
        },
    ],
});
async function created() {
    const change = await createChange(
        {
            target: { kind: "page-create", pageId: "welcome" },
            patch: {
                kind: "page-create",
                title: "Original title",
                content: text("Supplied heading"),
                intent: "Welcome page",
                materials: "Source",
            },
            summary: "Create draft",
        },
        ctx,
    );
    if (!isPageCreation(change)) throw new Error("Expected creation");
    await approveChange(change.id, change.version, change.previewHash, ctx);
    return change;
}
async function prepare() {
    const creation = await created();
    const publication = await preparePublicationReview(creation.id, 1, ctx);
    if (!isPagePublication(publication))
        throw new Error("Expected publication");
    return publication;
}
const approve = (change: Awaited<ReturnType<typeof prepare>>) =>
    approveChange(change.id, change.version, change.previewHash, ctx);
beforeEach(async () => {
    jest.restoreAllMocks();
    const id = randomUUID();
    const domain = await DomainModel.create({
        name: `publication-${id}`,
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
    ctx = { subdomain: domain, user };
});
test("preparation snapshots the exact current native draft, retains duplicate headings, and recovers one proposal without writing the page", async () => {
    const creation = await created();
    await native.updatePage({
        context: ctx,
        pageId: "welcome",
        documentId: creation.baseline.documentId,
        title: "Changed title",
        description: "Exact description",
        robotsAllowed: false,
    });
    const before = JSON.stringify(
        await PageModel.findById(creation.baseline.documentId),
    );
    const first = await preparePublicationReview(creation.id, 1, ctx);
    const second = await preparePublicationReview(creation.id, 1, ctx);
    expect(second.id).toBe(first.id);
    if (!isPagePublication(first)) throw new Error("Expected publication");
    expect(first.preview).toMatchObject({
        title: "Changed title",
        description: "Exact description",
        robotsAllowed: false,
        path: "/p/welcome",
    });
    expect(first.preview.layout[1].settings?.text).toMatchObject({
        content: [
            { content: [{ text: "Original title" }] },
            { content: [{ text: "Supplied heading" }] },
        ],
    });
    expect(
        JSON.stringify(await PageModel.findById(creation.baseline.documentId)),
    ).toBe(before);
    expect(
        await native.getPage({
            id: "welcome",
            ctx: { ...ctx, user: undefined },
        }),
    ).toBeUndefined();
});
test("explicit separate approval publishes once through native service and retains an atomic result without changing global drafts", async () => {
    const change = await prepare();
    const before = JSON.stringify(
        await DomainModel.findById(ctx.subdomain._id),
    );
    const spy = jest.spyOn(native, "publish");
    await Promise.all([approve(change), approve(change)]);
    expect((await reconcileChange(change.id, ctx)).state.kind).toBe("applied");
    expect(spy).toHaveBeenCalledTimes(1);
    const page = await PageModel.findById(change.baseline.documentId);
    expect(page).toMatchObject({
        draftOnly: false,
        title: "Original title",
        publicationReceipt: {
            outcome: "applied",
            changeId: change.id,
            version: 1,
            previewHash: change.previewHash,
        },
    });
    expect((await getChange(change.id, ctx)).approvals).toHaveLength(1);
    expect(JSON.stringify(await DomainModel.findById(ctx.subdomain._id))).toBe(
        before,
    );
    expect(
        (
            await native.getPage({
                id: "welcome",
                ctx: { ...ctx, user: undefined },
            })
        )?.title,
    ).toBe("Original title");
    await expect(prepareRevert(change.id, 1, ctx)).rejects.toMatchObject({
        code: "unsupported_action",
    });
});
test.each(["draftTitle", "draftDescription"])(
    "a native %s write without a revision increment invalidates approval",
    async (field) => {
        const change = await prepare();
        await PageModel.updateOne(
            { _id: change.baseline.documentId },
            { $set: { [field]: "Later unsaved review" } },
        );
        expect((await approve(change)).state.kind).toBe("stale");
        expect(
            (await PageModel.findById(change.baseline.documentId)).draftOnly,
        ).toBe(true);
        const refreshed = await preparePublicationReview(change.id, 1, ctx);
        expect(refreshed.version).toBe(2);
        expect(refreshed.history).toHaveLength(1);
        await expect(approve(change)).rejects.toMatchObject({
            code: "conflict",
        });
        expect(
            (await approveChange(refreshed.id, 2, refreshed.previewHash, ctx))
                .state.kind,
        ).toBe("applied");
    },
);
test("site appearance changes are stale even with an old request domain", async () => {
    const change = await prepare();
    await DomainModel.updateOne(
        { _id: ctx.subdomain._id },
        {
            $set: {
                sharedWidgets: { header: { settings: { title: "Later" } } },
            },
        },
    );
    expect((await approve(change)).state.kind).toBe("stale");
    expect(
        (await PageModel.findById(change.baseline.documentId)).draftOnly,
    ).toBe(true);
});
test("global draft consequences are retained and block approval; resolving them requires a fresh review", async () => {
    const creation = await created();
    await DomainModel.updateOne(
        { _id: ctx.subdomain._id },
        {
            $set: {
                draftSharedWidgets: {
                    header: { settings: { title: "Pending" } },
                },
            },
        },
    );
    const change = await preparePublicationReview(creation.id, 1, ctx);
    if (!isPagePublication(change)) throw new Error("Expected publication");
    expect(change.preview.globalDrafts.sharedWidgets).toBe(true);
    await expect(approve(change)).rejects.toMatchObject({
        code: "global_drafts",
    });
    expect(
        (await PageModel.findById(change.baseline.documentId)).draftOnly,
    ).toBe(true);
    await DomainModel.updateOne(
        { _id: ctx.subdomain._id },
        { $set: { draftSharedWidgets: {} } },
    );
    await expect(approve(change)).rejects.toMatchObject({
        code: "global_drafts",
    });
    const refreshed = await preparePublicationReview(change.id, 1, ctx);
    expect(
        (
            await approveChange(
                refreshed.id,
                refreshed.version,
                refreshed.previewHash,
                ctx,
            )
        ).state.kind,
    ).toBe("applied");
});
test("a lost successful native response reads its receipt instead of publishing again", async () => {
    const change = await prepare();
    const original = native.publish;
    const spy = jest
        .spyOn(native, "publish")
        .mockImplementationOnce(async (...args) => {
            await original(...args);
            throw new Error("Lost response");
        });
    expect((await approve(change)).state.kind).toBe("applied");
    expect((await approve(change)).state.kind).toBe("applied");
    expect(spy).toHaveBeenCalledTimes(1);
});
test("recovery cancels a delayed native CAS without publishing content or permitting its late write", async () => {
    const change = await prepare();
    let release!: () => void, entered!: () => void;
    const paused = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const resume = new Promise<void>((resolve) => {
        release = resolve;
    });
    const original = save.guardedNativePageSave;
    jest.spyOn(save, "guardedNativePageSave").mockImplementationOnce(
        async (...args) => {
            entered();
            await resume;
            return original(...args);
        },
    );
    const pending = approve(change);
    await paused;
    expect((await reconcileChange(change.id, ctx)).state.kind).toBe("failed");
    release();
    expect((await pending).state.kind).toBe("failed");
    expect(await PageModel.findById(change.baseline.documentId)).toMatchObject({
        draftOnly: true,
        layout: [],
        publicationReceipt: { outcome: "cancelled" },
    });
});
test("unavailable recovery retains the lock and never retries native publication", async () => {
    const change = await prepare();
    const spy = jest
        .spyOn(native, "publish")
        .mockRejectedValueOnce(new Error("Interrupted"));
    jest.spyOn(PageModel, "findOne").mockRejectedValueOnce(
        new Error("Read unavailable"),
    );
    expect((await approve(change)).state.kind).toBe("uncertain");
    expect((await getChange(change.id, ctx)).activeTarget).toBe(
        `page:${change.baseline.documentId}`,
    );
    expect((await reconcileChange(change.id, ctx)).state.kind).toBe("failed");
    expect(spy).toHaveBeenCalledTimes(1);
});
test("deleted result and reused route cannot publish a replacement", async () => {
    const change = await prepare();
    await native.deletePageInternal(ctx, "welcome");
    const replacement = await created();
    await expect(
        preparePublicationReview(change.id, 1, ctx),
    ).rejects.toMatchObject({ code: "stale" });
    expect((await approve(change)).state.kind).toBe("failed");
    expect(
        (await PageModel.findById(replacement.baseline.documentId)).draftOnly,
    ).toBe(true);
});
test("unsupported draft blocks refuse an incomplete publication preview", async () => {
    const creation = await created();
    await PageModel.updateOne(
        { _id: creation.baseline.documentId },
        {
            $push: {
                draftLayout: {
                    widgetId: "private",
                    name: "community",
                    settings: {},
                },
            },
        },
    );
    await expect(
        preparePublicationReview(creation.id, 1, ctx),
    ).rejects.toMatchObject({ code: "unsupported_target" });
});
test("permission, tenant, Mimic and current-account gates reject preparation and publication", async () => {
    const change = await prepare();
    for (const override of [
        { user: undefined },
        { user: { ...ctx.user.toObject(), permissions: [] } },
        { user: { ...ctx.user.toObject(), domain: "foreign" } },
        { memberMimic: {} },
    ]) {
        await expect(
            preparePublicationReview(change.id, 1, { ...ctx, ...override }),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
            approveChange(change.id, 1, change.previewHash, {
                ...ctx,
                ...override,
            }),
        ).rejects.toMatchObject({ code: "forbidden" });
    }
    await beginAccountClosure({
        domainId: String(ctx.subdomain._id),
        userId: ctx.user.userId,
    });
    await expect(
        preparePublicationReview(change.id, 1, ctx),
    ).rejects.toMatchObject({ code: "account_unavailable" });
    expect((await approve(change)).state.kind).toBe("failed");
    expect(
        (await PageModel.findById(change.baseline.documentId)).draftOnly,
    ).toBe(true);
});
test("caller-supplied publication and extra draft payloads are not accepted", () => {
    expect(() =>
        contentChangeInputSchema.parse({
            target: { kind: "page-publish", pageId: "welcome" },
            patch: { kind: "page-publish" },
            summary: "Publish",
        }),
    ).toThrow();
    expect(
        contentChangeActionSchema.parse({
            action: "prepare-publication",
            version: 1,
        }),
    ).toEqual({ action: "prepare-publication", version: 1 });
    expect(() =>
        contentChangeActionSchema.parse({
            action: "prepare-publication",
            version: 1,
            layout: [],
        }),
    ).toThrow();
});
test("rejecting publication leaves the native draft hidden", async () => {
    const change = await prepare();
    await rejectChange(change.id, 1, ctx);
    await expect(approve(change)).rejects.toMatchObject({ code: "conflict" });
    expect(
        (await PageModel.findById(change.baseline.documentId)).draftOnly,
    ).toBe(true);
});

test("creation's review action returns the retained publication receipt after the page is live, and rejected review can be refreshed explicitly", async () => {
    const change = await prepare();
    await rejectChange(change.id, 1, ctx);
    const refreshed = await preparePublicationReview(change.id, 1, ctx);
    expect(refreshed.version).toBe(2);
    expect(refreshed.history).toHaveLength(1);
    expect(
        (await approveChange(refreshed.id, 2, refreshed.previewHash, ctx)).state
            .kind,
    ).toBe("applied");
    const retained = await preparePublicationReview(
        change.target.creationChangeId,
        1,
        ctx,
    );
    expect(retained.id).toBe(change.id);
    expect(retained.state.kind).toBe("applied");
});
test("native publication's private guard rejects an invented approval even if its page fingerprint is correct", async () => {
    const change = await prepare();
    await expect(
        native.publish(change.target.pageId, ctx, change.baseline.documentId, {
            ...change.baseline,
            creationChangeId: change.target.creationChangeId,
            receipt: {
                outcome: "applied",
                changeId: change.id,
                operationId: "invented",
                version: 1,
                previewHash: change.previewHash,
                revision: change.baseline.revision + 1,
                at: new Date().toISOString(),
            },
        }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(
        (await PageModel.findById(change.baseline.documentId)).draftOnly,
    ).toBe(true);
});

test.each(["socialImage", "draftSocialImage"])(
    "%s cannot introduce an asset outside this text publication review",
    async (field) => {
        const creation = await created();
        await PageModel.updateOne(
            { _id: creation.baseline.documentId },
            { $set: { [field]: { mediaId: "unreviewed-image" } } },
        );
        await expect(
            preparePublicationReview(creation.id, 1, ctx),
        ).rejects.toMatchObject({ code: "unsupported_target" });
    },
);
test("changed shared chrome order cannot be silently omitted from the publication review", async () => {
    const creation = await created();
    await PageModel.updateOne(
        { _id: creation.baseline.documentId },
        {
            $set: {
                draftLayout: [
                    creation.preview.layout[1],
                    creation.preview.layout[0],
                    creation.preview.layout[2],
                ],
            },
        },
    );
    await expect(
        preparePublicationReview(creation.id, 1, ctx),
    ).rejects.toMatchObject({ code: "unsupported_target" });
});
