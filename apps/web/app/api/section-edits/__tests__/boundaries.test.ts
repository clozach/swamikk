import { randomUUID } from "crypto";
import PageModel from "@/models/Page";
import UserModel from "@/models/User";
import { auth } from "@/auth";
import { SectionEditModel } from "@/services/section-edits/model";
import { consumeRateLimit } from "@/services/content-changes/rate-limit";
import { applySectionEdit } from "@/services/section-edits/apply";
import type GQLContext from "@/models/GQLContext";
import { harness } from "./harness";
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
    deleteMedia: jest.fn(),
}));

describe("section edit boundaries", () => {
    afterEach(() => jest.restoreAllMocks());

    it("restores the final section into both formerly nonempty layouts", async () => {
        const h = await harness();
        const before: any = await h.fresh();
        await PageModel.updateOne(
            { _id: h.page._id },
            {
                $set: {
                    layout: [before.layout[2]],
                    draftLayout: [before.draftLayout[2]],
                },
            },
        );
        const original: any = await h.fresh();
        const removed = (await (await h.post(await h.removal())).json()).edit;
        expect(((await h.fresh()) as any).draftLayout).toEqual([]);
        expect((await h.reverse(removed.editId)).status).toBe(200);
        const restored: any = await h.fresh();
        expect(restored.layout).toEqual(original.layout);
        expect(restored.draftLayout).toEqual(original.draftLayout);
    });

    it("refuses a removal whose existing duplicate sibling identities prevent a safe restore", async () => {
        const h = await harness();
        const input = await h.removal();
        const before: any = await h.fresh();
        await PageModel.updateOne(
            { _id: h.page._id },
            { $push: { layout: before.layout[1] } },
        );
        expect((await h.post(input)).status).toBe(409);
        expect(
            await SectionEditModel.countDocuments({ domain: h.domain._id }),
        ).toBe(0);
    });

    it("rejects cross-origin, oversized, malformed, anonymous and Mimic requests", async () => {
        const h = await harness();
        const input = await h.removal();
        expect(
            (await h.post(input, { origin: "https://other.example" })).status,
        ).toBe(403);
        expect(
            (await h.post(input, { "sec-fetch-site": "cross-site" })).status,
        ).toBe(403);
        expect(
            (await h.post(input, { "content-type": "text/plain" })).status,
        ).toBe(415);
        expect(
            (await h.post(input, { "content-length": "10000" })).status,
        ).toBe(413);
        expect((await h.post({ ...input, invented: true })).status).toBe(400);
        const mimic = { cookie: "courselit.member-mimic=expired" };
        expect((await h.post(input, mimic)).status).toBe(403);
        expect((await h.list(mimic)).status).toBe(403);
        expect((await h.historyResponse(undefined, mimic)).status).toBe(403);
        await expect(
            applySectionEdit(input, {
                user: h.user,
                subdomain: h.domain,
                memberMimic: {},
            } as unknown as GQLContext),
        ).rejects.toMatchObject({ code: "forbidden" });
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(null);
        expect((await h.post(input)).status).toBe(403);
        expect((await h.list()).status).toBe(403);
        expect(
            await SectionEditModel.countDocuments({ domain: h.domain._id }),
        ).toBe(0);
    });

    it("requires site management permission and bounds request rate", async () => {
        const h = await harness();
        const input = await h.removal();
        await UserModel.updateOne(
            { _id: h.user._id },
            { $set: { permissions: ["course:manage_any"] } },
        );
        expect((await h.post(input)).status).toBe(403);
        expect((await h.historyResponse()).status).toBe(403);
        await UserModel.updateOne(
            { _id: h.user._id },
            { $set: { permissions: ["site:manage"] } },
        );
        const key = `${h.domain._id}:section-edit:${h.user.userId}`;
        for (let i = 0; i < 119; i++) await consumeRateLimit(key, 120, 60_000);
        expect((await h.post(input)).status).toBe(429);
    });

    it("protects fixed/shared headers and footers even with forged removable flags", async () => {
        const h = await harness();
        const base = await h.removal();
        if (base.action !== "remove") throw new Error("fixture");
        for (const widgetId of ["header", "footer"]) {
            await PageModel.updateOne(
                { _id: h.page._id },
                {
                    $set: {
                        "layout.$[block].shared": false,
                        "layout.$[block].deleteable": true,
                    },
                },
                { arrayFilters: [{ "block.widgetId": widgetId }] },
            );
            expect(
                (
                    await h.post({
                        ...base,
                        requestId: randomUUID(),
                        target: { ...base.target, widgetId },
                    })
                ).status,
            ).toBe(400);
        }
        expect(
            (await h.listed()).sections.map((item) => item.widgetId),
        ).toEqual(["one", "two", "three"]);
        expect(
            await SectionEditModel.countDocuments({ domain: h.domain._id }),
        ).toBe(0);
    });

    it("isolates tenants and refuses recovery into a replacement page at the same route", async () => {
        const h = await harness();
        const input = await h.removal();
        const removed = (await (await h.post(input)).json()).edit;
        const foreign = await harness();
        expect((await foreign.reverse(removed.editId)).status).toBe(404);
        expect((await foreign.post(input)).status).toBe(404);
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
            user: { email: h.user.email },
        });
        const original: any = await h.fresh();
        await PageModel.deleteOne({ _id: h.page._id });
        const { _id, ...replacement } = original;
        await PageModel.create(replacement);
        expect((await h.reverse(removed.editId)).status).toBe(409);
        expect((await h.listed()).removed).toEqual([]);
        expect((await (await h.historyResponse()).json()).edits).toEqual([]);
        expect(
            await SectionEditModel.countDocuments({ domain: h.domain._id }),
        ).toBe(1);
    });

    it("wins no write when a simultaneous native edit changes the captured page", async () => {
        const h = await harness();
        const input = await h.removal();
        const write = PageModel.findOneAndUpdate.bind(PageModel);
        jest.spyOn(PageModel, "findOneAndUpdate").mockImplementationOnce(
            (...args: any[]) =>
                ({
                    lean: async () => {
                        await PageModel.updateOne(
                            { _id: h.page._id },
                            {
                                $set: {
                                    "layout.1.settings.heading":
                                        "Concurrent words",
                                },
                            },
                        );
                        return write(...args).lean();
                    },
                }) as any,
        );
        expect((await h.post(input)).status).toBe(409);
        const current: any = await h.fresh();
        expect(current.layout[1].settings.heading).toBe("Concurrent words");
        expect(current.layout.map((item: any) => item.widgetId)).toContain(
            "two",
        );
        expect(
            (await SectionEditModel.findOne({
                editId: input.requestId,
            }).lean())!.state.kind,
        ).toBe("failed");
    });

    it("restores pages with no draft, but preserves a newly-created conflicting draft", async () => {
        const h = await harness();
        await PageModel.updateOne(
            { _id: h.page._id },
            { $set: { draftLayout: [] } },
        );
        const first = (await (await h.post(await h.removal())).json()).edit;
        expect((await h.reverse(first.editId)).status).toBe(200);
        const second = (await (await h.post(await h.removal())).json()).edit;
        const current: any = await h.fresh();
        await PageModel.updateOne(
            { _id: h.page._id },
            { $set: { draftLayout: current.layout } },
        );
        const response = await h.reverse(second.editId);
        expect(response.status).toBe(409);
        expect((await response.json()).error.code).toBe("draft_conflict");
    });
});
