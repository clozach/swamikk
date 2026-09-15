import { randomUUID } from "crypto";
import PageModel from "@/models/Page";
import { SectionEditModel } from "@/services/section-edits/model";
import { harness, widget } from "./harness";
import { sectionEditHistory } from "@/services/section-edits/read";
import type GQLContext from "@/models/GQLContext";
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
    deleteMedia: jest.fn(),
}));

describe("durable section edits", () => {
    afterEach(() => jest.restoreAllMocks());

    it("retains adjacent ordering when the previous removal has an unsettled receipt", async () => {
        const h = await harness();
        const first = await h.removal("two");
        const second = await h.removal("one");
        jest.spyOn(SectionEditModel, "updateOne").mockImplementationOnce(() => {
            throw new Error("lost settlement");
        });
        expect((await h.post(first)).status).toBe(503);
        expect((await h.post(second)).status).toBe(200);
        expect((await h.reverse(first.requestId)).status).toBe(200);
        expect((await h.reverse(second.requestId)).status).toBe(200);
        expect(
            ((await h.fresh()) as any).layout.map((item: any) => item.widgetId),
        ).toEqual(["header", "one", "two", "three", "footer"]);
    });

    it.each([
        ["two", "one"],
        ["one", "two"],
    ])(
        "restores adjacent removals in either order (%s then %s)",
        async (firstId, secondId) => {
            const h = await harness();
            const first = (
                await (await h.post(await h.removal(firstId))).json()
            ).edit;
            const second = (
                await (await h.post(await h.removal(secondId))).json()
            ).edit;
            expect((await h.reverse(first.editId)).status).toBe(200);
            expect((await h.reverse(second.editId)).status).toBe(200);
            expect(
                ((await h.fresh()) as any).layout.map(
                    (item: any) => item.widgetId,
                ),
            ).toEqual(["header", "one", "two", "three", "footer"]);
        },
    );

    it("removes immediately, restores complete settings/identity/order after reload, and records undo/redo", async () => {
        const h = await harness();
        const before: any = await h.fresh();
        expect(
            (await h.listed()).sections.map((entry) => entry.widgetId),
        ).toEqual(["one", "two", "three"]);
        const response = await h.post(await h.removal());
        expect(response.status).toBe(200);
        const removed = (await response.json()).edit;
        const after: any = await h.fresh();
        expect(after.layout.map((item: any) => item.widgetId)).toEqual([
            "header",
            "one",
            "three",
            "footer",
        ]);
        expect(after.draftLayout.map((item: any) => item.widgetId)).toEqual([
            "header",
            "one",
            "three",
            "footer",
        ]);
        expect(after.sectionEditReceipts).toEqual([]);
        expect((await h.listed()).removed).toEqual([removed]);
        const restored = await h.reverse(removed.editId);
        expect(restored.status).toBe(200);
        const restoration = (await restored.json()).edit;
        expect(restoration).toMatchObject({
            action: "restore",
            undoOf: removed.editId,
        });
        const current: any = await h.fresh();
        expect(current.layout).toEqual(before.layout);
        expect(current.draftLayout).toEqual(before.draftLayout);
        expect((await h.listed()).removed).toEqual([]);
        expect((await h.reverse(restoration.editId)).status).toBe(200);
        expect((await (await h.historyResponse()).json()).edits).toHaveLength(
            3,
        );
        const rows = await SectionEditModel.find({
            domain: h.domain._id,
        }).lean();
        expect(rows.every((row) => row.state.kind === "applied")).toBe(true);
        expect(rows[0].snapshot.published.widget.settings!.image).toMatchObject(
            { mediaId: "two-media" },
        );
    });

    it("preserves unrelated live and draft work; rejects changed/missing draft blocks atomically", async () => {
        const h = await harness();
        const input = await h.removal();
        await PageModel.updateOne(
            { _id: h.page._id },
            {
                $set: {
                    "draftLayout.1.settings.heading": "Unpublished other words",
                },
            },
        );
        const removed = (await (await h.post(input)).json()).edit;
        await PageModel.updateOne(
            { _id: h.page._id },
            { $set: { "layout.2.settings.heading": "Later other words" } },
        );
        expect((await h.reverse(removed.editId)).status).toBe(200);
        let current: any = await h.fresh();
        expect(current.draftLayout[1].settings.heading).toBe(
            "Unpublished other words",
        );
        expect(current.layout[3].settings.heading).toBe("Later other words");
        const attempt = await h.removal();
        await PageModel.updateOne(
            { _id: h.page._id },
            {
                $set: {
                    "draftLayout.2.settings.heading":
                        "Unpublished selected words",
                },
            },
        );
        const blocked = await h.post(attempt);
        expect(blocked.status).toBe(409);
        expect((await blocked.json()).error.code).toBe("draft_conflict");
        current = await h.fresh();
        expect(current.layout.map((item: any) => item.widgetId)).toContain(
            "two",
        );
        await PageModel.updateOne(
            { _id: h.page._id },
            { $pull: { draftLayout: { widgetId: "two" } } },
        );
        expect((await h.post(attempt)).status).toBe(409);
    });

    it("retains inserted siblings and refuses reversed/missing anchors or overwritten restored text", async () => {
        const h = await harness();
        const removed = (await (await h.post(await h.removal())).json()).edit;
        const current: any = await h.fresh();
        current.layout.splice(2, 0, widget("new"));
        current.draftLayout.splice(2, 0, widget("new"));
        await PageModel.updateOne(
            { _id: h.page._id },
            {
                $set: {
                    layout: current.layout,
                    draftLayout: current.draftLayout,
                },
            },
        );
        const restoration = (await (await h.reverse(removed.editId)).json())
            .edit;
        const restored: any = await h.fresh();
        expect(restored.layout.map((item: any) => item.widgetId)).toEqual([
            "header",
            "one",
            "new",
            "two",
            "three",
            "footer",
        ]);
        await PageModel.updateOne(
            { _id: h.page._id },
            {
                $set: {
                    "layout.3.settings.heading": "Changed after restore",
                    "draftLayout.3.settings.heading": "Changed after restore",
                },
            },
        );
        expect((await h.reverse(restoration.editId)).status).toBe(409);
        const second = (await (await h.post(await h.removal())).json()).edit;
        const moved: any = await h.fresh();
        moved.layout = [
            moved.layout[0],
            moved.layout[4],
            moved.layout[3],
            moved.layout[2],
            moved.layout[1],
        ];
        await PageModel.updateOne(
            { _id: h.page._id },
            { $set: { layout: moved.layout } },
        );
        const conflict = await h.reverse(second.editId);
        expect(conflict.status).toBe(409);
        expect((await conflict.json()).error.code).toBe("order_conflict");
    });

    it("treats retries and simultaneous duplicate deliveries as the same durable action", async () => {
        const h = await harness();
        const input = await h.removal();
        const responses = await Promise.all([h.post(input), h.post(input)]);
        expect(responses.map((response) => response.status)).toEqual([
            200, 200,
        ]);
        const [one, two] = await Promise.all(
            responses.map((response) => response.json()),
        );
        expect(one).toEqual(two);
        expect((await h.post(input)).status).toBe(200);
        expect(
            await SectionEditModel.countDocuments({ domain: h.domain._id }),
        ).toBe(1);
        const conflict = await h.post({
            ...input,
            action: "reverse",
            editId: randomUUID(),
        });
        expect(conflict.status).toBe(400); // Strict discriminated input rejects extra removal fields.
        expect(
            (
                await h.post({
                    action: "reverse",
                    requestId: input.requestId,
                    editId: randomUUID(),
                })
            ).status,
        ).toBe(409);
    });

    it("recovers lost settlement after unrelated edits and retains receipt until history is durable", async () => {
        const h = await harness();
        const input = await h.removal();
        jest.spyOn(SectionEditModel, "updateOne").mockImplementationOnce(() => {
            throw new Error("simulated process interruption");
        });
        expect((await h.post(input)).status).toBe(503);
        let current: any = await h.fresh();
        expect(current.sectionEditReceipts).toEqual([input.requestId]);
        expect(current.layout.map((item: any) => item.widgetId)).not.toContain(
            "two",
        );
        expect(
            (await SectionEditModel.findOne({
                editId: input.requestId,
            }).lean())!.state.kind,
        ).toBe("applying");
        await PageModel.updateOne(
            { _id: h.page._id },
            {
                $set: { "layout.1.settings.heading": "A later edit" },
                $inc: { __v: 1 },
            },
        );
        const listed = await h.listed();
        expect(listed.removed[0].editId).toBe(input.requestId);
        current = await h.fresh();
        expect(current.sectionEditReceipts).toEqual([]);
        expect(current.layout[1].settings.heading).toBe("A later edit");
        expect((await h.post(input)).status).toBe(200);
        expect((await h.reverse(input.requestId)).status).toBe(200);
    });

    it("records before writing and resumes an interrupted pre-write attempt using its original baseline", async () => {
        const h = await harness();
        const input = await h.removal();
        jest.spyOn(PageModel, "findOneAndUpdate").mockImplementationOnce(() => {
            throw new Error("simulated database interruption");
        });
        expect((await h.post(input)).status).toBe(503);
        expect(
            (await SectionEditModel.findOne({
                editId: input.requestId,
            }).lean())!.state.kind,
        ).toBe("applying");
        expect((await h.post(input)).status).toBe(200);
        const next = await h.removal("one");
        jest.spyOn(PageModel, "findOneAndUpdate").mockImplementationOnce(() => {
            throw new Error("second interruption");
        });
        expect((await h.post(next)).status).toBe(503);
        await PageModel.updateOne(
            { _id: h.page._id },
            { $set: { "layout.1.settings.heading": "Moved before retry" } },
        );
        expect((await h.post(next)).status).toBe(409);
        expect(
            (await SectionEditModel.findOne({ editId: next.requestId }).lean())!
                .state.kind,
        ).toBe("failed");
        expect(((await h.fresh()) as any).layout[1].settings.heading).toBe(
            "Moved before retry",
        );
    });

    it("keeps history pagination complete when several edits share a timestamp", async () => {
        const h = await harness();
        const first = (await (await h.post(await h.removal())).json()).edit;
        const second = (await (await h.reverse(first.editId)).json()).edit;
        await h.reverse(second.editId);
        await SectionEditModel.updateMany(
            { domain: h.domain._id },
            { $set: { at: "2026-09-15T00:00:00.000Z" } },
        );
        const ctx = {
            user: h.user,
            subdomain: h.domain,
        } as unknown as GQLContext;
        const ids: string[] = [];
        let cursor: string | undefined;
        do {
            const page = await sectionEditHistory(
                h.page.pageId,
                ctx,
                cursor,
                1,
            );
            ids.push(...page.edits.map((item) => item.editId));
            cursor = page.nextCursor || undefined;
        } while (cursor);
        expect(new Set(ids).size).toBe(3);
        expect(ids).toHaveLength(3);
        expect((await h.historyResponse("broken")).status).toBe(400);
    });
});
