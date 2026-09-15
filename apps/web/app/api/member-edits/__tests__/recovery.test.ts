import UserModel from "@/models/User";
import { MemberEditModel } from "@/services/member-edits/model";
import { ContactPreferencesModel } from "@/services/contact-preferences/model";
import { GET, POST } from "../route";
import { GET as history } from "../history/route";
import {
    type Fixture,
    change,
    mimic,
    request,
    seed,
    teardown,
} from "./harness";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/queue", () => ({ addMailJob: jest.fn() }));

describe("durable member-edit receipts", () => {
    let f: Fixture;
    let cookie: string;
    const post = (body: unknown) =>
        POST(request(f, "/api/member-edits", "POST", body, { cookie }));
    const get = () =>
        GET(request(f, "/api/member-edits", "GET", undefined, { cookie }));
    const list = () =>
        history(
            request(f, "/api/member-edits/history", "GET", undefined, {
                cookie,
            }),
        );
    beforeEach(async () => {
        f = await seed();
        cookie = await mimic(f, f.member);
    });
    afterEach(async () => {
        jest.restoreAllMocks();
        await teardown(f);
    });

    it("rejects a cross-document edit before creating a row or writing data", async () => {
        const response = await post({
            changes: [
                change("name", "Member", "Renamed"),
                change("checkIns", "none", "occasional"),
            ],
        });
        expect(response.status).toBe(400);
        expect((await UserModel.findById(f.member._id)).name).toBe("Member");
        expect(
            await MemberEditModel.countDocuments({ domain: f.domain._id }),
        ).toBe(0);
        expect(
            await ContactPreferencesModel.countDocuments({
                domain: f.domain._id,
            }),
        ).toBe(0);
    });

    it.each(["name", "checkIns"])(
        "recovers %s after the record write committed but its response was lost",
        async (field) => {
            const model: any =
                field === "name" ? UserModel : ContactPreferencesModel;
            const original = model.findOneAndUpdate.bind(model);
            jest.spyOn(model, "findOneAndUpdate").mockImplementationOnce(
                (...args: any[]) =>
                    (async () => {
                        await original(...args);
                        throw new Error("Injected lost database response");
                    })(),
            );
            const before = field === "name" ? "Member" : "none";
            const after = field === "name" ? "Renamed" : "occasional";
            const failed = await post({
                changes: [change(field, before, after)],
            });
            expect(failed.status).toBe(503);
            const row = await MemberEditModel.findOne({ domain: f.domain._id });
            expect(row?.state).toBe("applying");
            const record = await model
                .findOne({ domain: f.domain._id, userId: f.member.userId })
                .select("+memberEditReceipts")
                .lean();
            expect(record.memberEditReceipts).toContain(row?.editId);
            expect((await get()).status).toBe(200);
            const historyBody = await (await list()).json();
            expect(historyBody.edits).toHaveLength(1);
            expect(historyBody.edits[0]).toMatchObject({
                editorUserId: f.admin.userId,
                changes: [change(field, before, after)],
            });
            const undo = await post({
                changes: [change(field, after, before)],
                undoOf: row?.editId,
            });
            expect(undo.status).toBe(200);
            const restored = await model
                .findOne({ domain: f.domain._id, userId: f.member.userId })
                .select("+memberEditReceipts")
                .lean();
            expect(restored[field]).toBe(before);
            expect(restored.memberEditReceipts || []).toEqual([]);
        },
    );

    it("recovers a settlement failure directly through History after later edits", async () => {
        jest.spyOn(MemberEditModel, "updateOne").mockImplementationOnce((() =>
            Promise.reject(new Error("Injected history outage"))) as any);
        expect(
            (await post({ changes: [change("name", "Member", "First")] }))
                .status,
        ).toBe(503);
        // An ordinary member write can change the value again; a receipt proves
        // the original edit even when its after value no longer matches today.
        await UserModel.updateOne(
            { _id: f.member._id },
            { $set: { name: "Later" } },
        );
        const body = await (await list()).json();
        expect(body.edits).toHaveLength(1);
        expect(body.edits[0].changes).toEqual([
            change("name", "Member", "First"),
        ]);
        expect((await UserModel.findById(f.member._id)).name).toBe("Later");
        expect(
            await MemberEditModel.findOne({ domain: f.domain._id }).lean(),
        ).toMatchObject({ state: "applied" });
    });

    it.each(["", "  Legacy Name  "])(
        "restores a legacy name byte-for-byte: %j",
        async (oldName) => {
            await UserModel.updateOne(
                { _id: f.member._id },
                { $set: { name: oldName } },
            );
            const applied = await (
                await post({ changes: [change("name", oldName, "New name")] })
            ).json();
            expect(applied.kind).toBe("applied");
            const response = await post({
                changes: [change("name", "New name", oldName)],
                undoOf: applied.edit.editId,
            });
            expect(response.status).toBe(200);
            expect((await UserModel.findById(f.member._id)).name).toBe(oldName);
            const forged = await post({
                changes: [change("name", oldName, "A forged previous value")],
                undoOf: applied.edit.editId,
            });
            expect(forged.status).toBe(400);
        },
    );
});
