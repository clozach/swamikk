import mongoose from "mongoose";
import UserModel from "@/models/User";
import { addMailJob } from "@/services/queue";
import { MemberEditModel } from "@/services/member-edits/model";
import * as sessions from "@/services/member-edits/sessions";
import { GET, POST } from "../route";
import { POST as email } from "../email/route";
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

const mails = () => (addMailJob as jest.Mock).mock.calls.map((call) => call[0]);
const codeIn = (body: string) => body.match(/>(\d{6})<\/div>/)![1];
function gate() {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { promise, release };
}

describe("email recovery and concurrent confirmation", () => {
    let f: Fixture;
    let cookie: string;
    let target: string;
    const get = () =>
        GET(request(f, "/api/member-edits", "GET", undefined, { cookie }));
    const step = (body: unknown) =>
        email(request(f, "/api/member-edits/email", "POST", body, { cookie }));
    const propose = async () =>
        (
            await POST(
                request(
                    f,
                    "/api/member-edits",
                    "POST",
                    { changes: [change("email", f.member.email, target)] },
                    { cookie },
                ),
            )
        ).json();
    beforeEach(async () => {
        (addMailJob as jest.Mock).mockReset();
        f = await seed();
        cookie = await mimic(f, f.member);
        target = `new-${f.suffix}@example.com`;
    });
    afterEach(async () => {
        jest.restoreAllMocks();
        await teardown(f);
    });

    it.each(["write response", "session revocation"])(
        "keeps email history and effects recoverable after a lost %s",
        async (failure) => {
            const pending = (await propose()).pending;
            const code = codeIn(mails()[0].body);
            await mongoose.connection.collection("sessions").insertOne({
                domain: f.domain._id,
                userId: String(f.member._id),
                token: "old-session",
            });
            if (failure === "write response") {
                const original = UserModel.findOneAndUpdate.bind(UserModel);
                jest.spyOn(
                    UserModel,
                    "findOneAndUpdate",
                ).mockImplementationOnce(((...args: any[]) =>
                    (async () => {
                        await original(...args);
                        throw new Error(
                            "Injected lost email write acknowledgement",
                        );
                    })()) as any);
            } else {
                jest.spyOn(
                    sessions,
                    "revokeMemberSessions",
                ).mockRejectedValueOnce(
                    new Error("Injected session collection outage"),
                );
            }
            expect(
                (
                    await step({
                        action: "confirm",
                        pendingId: pending.pendingId,
                        code,
                    })
                ).status,
            ).toBe(503);
            expect((await UserModel.findById(f.member._id)).email).toBe(target);
            expect(
                (
                    await UserModel.findById(f.member._id).select(
                        "+memberEditReceipts",
                    )
                ).memberEditReceipts,
            ).toContain(pending.pendingId);
            const recovered = await get();
            expect(recovered.status).toBe(200);
            expect(
                (await recovered.json()).snapshot.emailEffects,
            ).toBeUndefined();
            expect(
                await MemberEditModel.findOne({
                    editId: pending.pendingId,
                }).lean(),
            ).toMatchObject({
                state: "applied",
                emailEffects: "complete",
                editorUserId: f.admin.userId,
            });
            expect(
                (
                    await UserModel.findById(f.member._id).select(
                        "+memberEditReceipts",
                    )
                ).memberEditReceipts,
            ).toEqual([]);
            expect(
                await mongoose.connection
                    .collection("sessions")
                    .countDocuments({
                        domain: f.domain._id,
                        token: "old-session",
                    }),
            ).toBe(0);
            expect(mails()).toHaveLength(2);
            expect(mails()[1].to).toEqual([f.member.email]);
        },
    );

    it("shows pending notice status and retries its durable intent on the next read", async () => {
        const pending = (await propose()).pending;
        const code = codeIn(mails()[0].body);
        (addMailJob as jest.Mock).mockRejectedValueOnce(
            new Error("Injected notification outage"),
        );
        const response = await step({
            action: "confirm",
            pendingId: pending.pendingId,
            code,
        });
        expect(response.status).toBe(200);
        const applied = await response.json();
        expect(applied.edit.emailEffects).toBe("pending");
        expect(applied.snapshot.emailEffects).toBe("pending");
        expect(
            await MemberEditModel.findOne({ editId: pending.pendingId }).lean(),
        ).toMatchObject({ state: "applied", emailEffects: "pending" });
        expect((await get()).status).toBe(200);
        expect(
            await MemberEditModel.findOne({ editId: pending.pendingId }).lean(),
        ).toMatchObject({ state: "applied", emailEffects: "complete" });
        expect(mails()).toHaveLength(3);
        expect(mails()[1].headers["Message-ID"]).toBe(
            mails()[2].headers["Message-ID"],
        );
    });

    it("a delayed wrong code cannot mark a concurrently applied email failed", async () => {
        const pending = (await propose()).pending;
        const code = codeIn(mails()[0].body);
        const wrongCode = code === "000000" ? "000001" : "000000";
        const reached = gate();
        const resume = gate();
        const original = MemberEditModel.findOneAndUpdate.bind(MemberEditModel);
        jest.spyOn(MemberEditModel, "findOneAndUpdate").mockImplementation(((
            query: any,
            update: any,
            options: any,
        ) =>
            (async () => {
                if (update.$inc?.attempts) {
                    reached.release();
                    await resume.promise;
                }
                return original(query, update, options);
            })()) as any);
        const wrong = step({
            action: "confirm",
            pendingId: pending.pendingId,
            code: wrongCode,
        });
        await reached.promise;
        const right = await step({
            action: "confirm",
            pendingId: pending.pendingId,
            code,
        });
        resume.release();
        expect(right.status).toBe(200);
        expect((await wrong).status).toBe(409);
        expect(
            await MemberEditModel.findOne({ editId: pending.pendingId }).lean(),
        ).toMatchObject({ state: "applied" });
        expect((await UserModel.findById(f.member._id)).email).toBe(target);
    });

    it("a code invalidated by a concurrent resend cannot claim the change", async () => {
        const pending = (await propose()).pending;
        const code = codeIn(mails()[0].body);
        const reached = gate();
        const resume = gate();
        const original = MemberEditModel.findOneAndUpdate.bind(MemberEditModel);
        jest.spyOn(MemberEditModel, "findOneAndUpdate").mockImplementation(((
            query: any,
            update: any,
            options: any,
        ) =>
            (async () => {
                if (update.$set?.state === "applying") {
                    reached.release();
                    await resume.promise;
                }
                return original(query, update, options);
            })()) as any);
        const old = step({
            action: "confirm",
            pendingId: pending.pendingId,
            code,
        });
        await reached.promise;
        const resent = await step({
            action: "resend",
            pendingId: pending.pendingId,
        });
        resume.release();
        expect(resent.status).toBe(200);
        expect((await old).status).toBe(404);
        expect((await UserModel.findById(f.member._id)).email).toBe(
            f.member.email,
        );
        const latest = codeIn(mails()[1].body);
        expect(
            (
                await step({
                    action: "confirm",
                    pendingId: pending.pendingId,
                    code: latest,
                })
            ).status,
        ).toBe(200);
    });

    it("a delayed final wrong attempt cannot expire a freshly resent code", async () => {
        const pending = (await propose()).pending;
        const code = codeIn(mails()[0].body);
        await MemberEditModel.updateOne(
            { editId: pending.pendingId },
            { $set: { attempts: 4 } },
        );
        const reached = gate();
        const resume = gate();
        const original = MemberEditModel.updateOne.bind(MemberEditModel);
        jest.spyOn(MemberEditModel, "updateOne").mockImplementation(((
            query: any,
            update: any,
            options: any,
        ) =>
            (async () => {
                if (update.$set?.failureReason === "attempts") {
                    reached.release();
                    await resume.promise;
                }
                return original(query, update, options);
            })()) as any);
        const wrong = step({
            action: "confirm",
            pendingId: pending.pendingId,
            code: code === "000000" ? "000001" : "000000",
        });
        await reached.promise;
        const resent = await step({
            action: "resend",
            pendingId: pending.pendingId,
        });
        resume.release();
        expect(resent.status).toBe(200);
        expect((await wrong).status).toBe(409);
        expect(
            await MemberEditModel.findOne({ editId: pending.pendingId }).lean(),
        ).toMatchObject({ state: "pending", attempts: 0, resends: 1 });
        expect(
            (
                await step({
                    action: "confirm",
                    pendingId: pending.pendingId,
                    code: codeIn(mails()[1].body),
                })
            ).status,
        ).toBe(200);
    });

    it("two concurrent resends cannot exceed the stored resend limit", async () => {
        const pending = (await propose()).pending;
        await MemberEditModel.updateOne(
            { editId: pending.pendingId },
            { $set: { resends: 2 } },
        );
        const reached = gate();
        const resume = gate();
        let waiting = 0;
        const original = MemberEditModel.findOneAndUpdate.bind(MemberEditModel);
        jest.spyOn(MemberEditModel, "findOneAndUpdate").mockImplementation(((
            query: any,
            update: any,
            options: any,
        ) =>
            (async () => {
                if (update.$inc?.resends) {
                    waiting += 1;
                    if (waiting === 2) reached.release();
                    await resume.promise;
                }
                return original(query, update, options);
            })()) as any);
        const both = [
            step({ action: "resend", pendingId: pending.pendingId }),
            step({ action: "resend", pendingId: pending.pendingId }),
        ];
        await reached.promise;
        resume.release();
        const responses = await Promise.all(both);
        expect(responses.map((response) => response.status).sort()).toEqual([
            200, 404,
        ]);
        expect(
            await MemberEditModel.findOne({ editId: pending.pendingId }).lean(),
        ).toMatchObject({ state: "pending", resends: 3 });
        expect(mails()).toHaveLength(2);
    });
});
