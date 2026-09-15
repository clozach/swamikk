import { readFileSync } from "fs";
import { join } from "path";
import { BSON, Binary, Decimal128, ObjectId } from "mongodb";
import PageModel from "@/models/Page";
import type GQLContext from "@/models/GQLContext";
import { applySectionEdit } from "@/services/section-edits/apply";
import { harness } from "./harness";
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
    deleteMedia: jest.fn(),
}));

it.each([false, true])(
    "restores the actual legacy homepage exactly (with native BSON=%s)",
    async (nativeBson) => {
        const h = await harness();
        // Full published/draft fixture from the page that returned 503 in the
        // local rig. Its legacy embedded _id values are stored buffer records.
        const layouts = JSON.parse(
            readFileSync(
                join(__dirname, "fixtures/legacy-homepage-layouts.json"),
                "utf8",
            ),
        );
        if (nativeBson) {
            for (const layout of [layouts.layout, layouts.draftLayout]) {
                const widget = layout.find(
                    (item: any) => item.widgetId === "ayr-anahataTour",
                );
                widget._id = new ObjectId("64aa00000000000000000001");
                widget.settings.retained = {
                    date: new Date("2020-01-01"),
                    id: new ObjectId("64aa00000000000000000002"),
                    binary: new Binary(new Uint8Array([0, 1, 255])),
                    decimal: Decimal128.fromString("1.20"),
                };
            }
        }
        await PageModel.collection.updateOne(
            { _id: h.page._id },
            { $set: layouts },
        );
        const input = await h.removal("ayr-anahataTour");
        const result = await applySectionEdit(input, {
            subdomain: h.domain,
            user: h.user,
        } as unknown as GQLContext);
        expect(result.kind).toBe("applied");
        const removed: any = await h.fresh();
        expect(removed.layout.map((item: any) => item.widgetId)).not.toContain(
            "ayr-anahataTour",
        );
        expect((await h.reverse(result.edit.editId)).status).toBe(200);
        const restored: any = await h.fresh();
        expect(restored.layout).toEqual(layouts.layout);
        expect(restored.draftLayout).toEqual(layouts.draftLayout);
        expect(
            BSON.serialize({
                layout: restored.layout,
                draftLayout: restored.draftLayout,
            }),
        ).toEqual(BSON.serialize(layouts));
    },
);
