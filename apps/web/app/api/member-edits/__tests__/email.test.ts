import mongoose from "mongoose";
import UserModel from "@/models/User";
import { addMailJob } from "@/services/queue";
import { MemberEditModel } from "@/services/member-edits/model";
import { confirmEmailChange } from "@/services/member-edits/email";
import { requireMimicEditor } from "@/services/member-edits/context";
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
const codeIn = (body: string) => body.match(/>(\d{6})<\/div>/)?.[1];

describe("changing a member's sign-in email from Member Mimic", () => {
    let f: Fixture;
    let cookie: string;
    let target: string;
    const get = (headers = {}) =>
        GET(request(f, "/api/member-edits", "GET", undefined, headers));
    const post = (body: unknown, headers = {}) =>
        POST(request(f, "/api/member-edits", "POST", body, headers));
    const step = (body: unknown, headers = {}) =>
        email(request(f, "/api/member-edits/email", "POST", body, headers));
    const inMimic = () => ({ cookie });
    const propose = (to = target, extra = {}) =>
        post(
            { changes: [change("email", f.member.email, to)], ...extra },
            inMimic(),
        );

    beforeEach(async () => {
        (addMailJob as jest.Mock).mockClear();
        f = await seed();
        cookie = await mimic(f, f.member);
        target = `fresh-${f.suffix}@example.com`;
    });
    afterEach(async () => {
        await teardown(f);
    });

    it("sends a code to a never-held address and keeps the code out of every response", async () => {
        const response = await propose(`  Fresh-${f.suffix}@Example.com `);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.kind).toBe("verify");
        expect(body.pending).toEqual({
            pendingId: expect.any(String),
            email: target,
            expiresAt: expect.any(String),
        });
        expect(body.snapshot.subject.email).toBe(f.member.email);
        expect(body.snapshot.pendingEmail).toEqual(body.pending);
        expect(mails()).toHaveLength(1);
        const mail = mails()[0];
        expect(mail.to).toEqual([target]);
        expect(mail.subject).toBe(
            "Confirm your new sign-in email — Karuna School",
        );
        expect(mail.account).toBeUndefined();
        const code = codeIn(mail.body)!;
        expect(code).toMatch(/^\d{6}$/);
        expect(mail.body).toContain(
            "Site support is changing the sign-in address",
        );
        expect(JSON.stringify(body)).not.toContain(code);
        const row = await MemberEditModel.findOne({
            editId: body.pending.pendingId,
        }).lean();
        expect(row).toMatchObject({
            state: "pending",
            attempts: 0,
            changes: [change("email", f.member.email, target)],
        });
        expect(row?.codeHash).toEqual(expect.any(String));
        expect(row?.codeHash).not.toContain(code);
        expect(
            ((await UserModel.findById(f.member._id).lean()) as any)?.email,
        ).toBe(f.member.email);
        const snapshot = await (await get(inMimic())).json();
        expect(snapshot.snapshot.pendingEmail.pendingId).toBe(
            body.pending.pendingId,
        );
    });

    it("counts wrong codes, then lands the change on the right one", async () => {
        const proposed = await (await propose()).json();
        const code = codeIn(mails()[0].body)!;
        const wrongCode = code === "000000" ? "000001" : "000000";
        await mongoose.connection.collection("sessions").insertMany([
            { domain: f.domain._id, userId: f.member._id, token: "a" },
            { domain: f.domain._id, userId: String(f.member._id), token: "b" },
            { domain: f.domain._id, userId: f.admin._id, token: "c" },
        ]);
        const before = (await UserModel.findById(f.member._id).lean()) as any;
        const wrong = await step(
            {
                action: "confirm",
                pendingId: proposed.pending.pendingId,
                code: wrongCode,
            },
            inMimic(),
        );
        expect(wrong.status).toBe(200);
        expect(await wrong.json()).toEqual({
            kind: "wrong-code",
            attemptsLeft: 4,
        });
        const right = await step(
            { action: "confirm", pendingId: proposed.pending.pendingId, code },
            inMimic(),
        );
        expect(right.status).toBe(200);
        const body = await right.json();
        expect(body.kind).toBe("applied");
        expect(body.edit).toMatchObject({
            editId: proposed.pending.pendingId,
            editorUserId: f.admin.userId,
            subjectUserId: f.member.userId,
            changes: [change("email", f.member.email, target)],
            emailVerification: { kind: "code-to-new-address" },
        });
        expect(body.snapshot.subject.email).toBe(target);
        expect(body.snapshot.pendingEmail).toBeUndefined();
        const raw = await mongoose.connection
            .collection("users")
            .findOne({ _id: f.member._id });
        expect(raw?.email).toBe(target);
        expect(raw?.emailVerified).toBe(true);
        expect(raw?.updatedAt).toEqual(before?.updatedAt);
        expect(
            await mongoose.connection.collection("sessions").countDocuments({
                domain: f.domain._id,
                token: { $in: ["a", "b"] },
            }),
        ).toBe(0);
        expect(
            await mongoose.connection
                .collection("sessions")
                .countDocuments({ domain: f.domain._id, token: "c" }),
        ).toBe(1);
        expect(mails()).toHaveLength(2);
        const notice = mails()[1];
        expect(notice.to).toEqual([f.member.email]);
        expect(notice.subject).toBe(
            "Your sign-in email was changed — Karuna School",
        );
        expect(notice.body).toContain(`from ${f.member.email} to ${target}`);
        expect(notice.body).toContain(
            "Sign-in codes now go to the new address.",
        );
        expect(notice.body).toContain(
            "If you did not ask for this, reply to this email.",
        );
        const row = await MemberEditModel.findOne({
            editId: proposed.pending.pendingId,
        }).lean();
        expect(row).toMatchObject({
            state: "applied",
            emailVerification: { kind: "code-to-new-address" },
        });
        for (const key of ["codeHash", "codeSalt", "attempts", "state"])
            expect(JSON.stringify(body)).not.toContain(`"${key}"`);
        // The same code cannot land twice.
        const again = await step(
            { action: "confirm", pendingId: proposed.pending.pendingId, code },
            inMimic(),
        );
        expect(again.status).toBe(404);
        // The view still resolves the member after the change.
        const snapshot = await (await get(inMimic())).json();
        expect(snapshot.snapshot.subject.email).toBe(target);
    });

    it("returns to a previously held address without a code, as a reversal", async () => {
        const proposed = await (await propose()).json();
        const code = codeIn(mails()[0].body)!;
        const applied = await (
            await step(
                {
                    action: "confirm",
                    pendingId: proposed.pending.pendingId,
                    code,
                },
                inMimic(),
            )
        ).json();
        (addMailJob as jest.Mock).mockClear();
        await mongoose.connection.collection("sessions").insertOne({
            domain: f.domain._id,
            userId: String(f.member._id),
            token: "d",
        });
        const back = await post(
            {
                changes: [change("email", target, f.member.email)],
                undoOf: applied.edit.editId,
            },
            inMimic(),
        );
        expect(back.status).toBe(200);
        const body = await back.json();
        expect(body.kind).toBe("applied");
        expect(body.edit).toMatchObject({
            undoOf: applied.edit.editId,
            emailVerification: { kind: "previously-held" },
            changes: [change("email", target, f.member.email)],
        });
        expect(body.snapshot.subject.email).toBe(f.member.email);
        expect(mails()).toHaveLength(1);
        expect(mails()[0].to).toEqual([target]);
        expect(mails()[0].subject).toContain("Your sign-in email was changed");
        expect(
            await mongoose.connection
                .collection("sessions")
                .countDocuments({ domain: f.domain._id, token: "d" }),
        ).toBe(0);
        expect(
            await MemberEditModel.countDocuments({
                domain: f.domain._id,
                state: "applied",
            }),
        ).toBe(2);
    });

    it("locks the owner's and the admin's own email, and an address another account holds", async () => {
        const ownerView = await mimic(f, f.owner);
        const owner = await post(
            { changes: [change("email", f.owner.email, target)] },
            { cookie: ownerView },
        );
        expect(owner.status).toBe(403);
        expect((await owner.json()).error.message).toBe(
            "The site owner's sign-in email cannot be changed from Member Mimic.",
        );
        const selfView = await mimic(f, f.admin);
        const self = await post(
            { changes: [change("email", f.admin.email, target)] },
            { cookie: selfView },
        );
        expect(self.status).toBe(403);
        expect((await self.json()).error.message).toBe(
            "Your own sign-in email cannot be changed from Member Mimic.",
        );
        await UserModel.create({
            domain: f.domain._id,
            userId: `inactive-${f.suffix}`,
            email: target,
            active: false,
            unsubscribeToken: `inactive-${f.suffix}`,
        });
        cookie = await mimic(f, f.member);
        const taken = await propose();
        expect(taken.status).toBe(409);
        expect(await taken.json()).toEqual({
            error: {
                code: "conflict",
                message: "That address already belongs to another account.",
            },
        });
        expect(mails()).toHaveLength(0);
        expect(
            await MemberEditModel.countDocuments({ domain: f.domain._id }),
        ).toBe(0);
    });

    it("cancels a pending change, and a newer proposal supersedes an older one", async () => {
        const first = await (await propose()).json();
        const second = await (
            await propose(`another-${f.suffix}@example.com`)
        ).json();
        expect(
            await MemberEditModel.findOne({
                editId: first.pending.pendingId,
            }).lean(),
        ).toMatchObject({ state: "failed", failureReason: "superseded" });
        const stale = await step(
            { action: "cancel", pendingId: first.pending.pendingId },
            inMimic(),
        );
        expect(stale.status).toBe(404);
        const cancelled = await step(
            { action: "cancel", pendingId: second.pending.pendingId },
            inMimic(),
        );
        expect(cancelled.status).toBe(200);
        const body = await cancelled.json();
        expect(body.kind).toBe("cancelled");
        expect(body.snapshot.pendingEmail).toBeUndefined();
        expect(body.snapshot.subject.email).toBe(f.member.email);
        expect(
            await MemberEditModel.findOne({
                editId: second.pending.pendingId,
            }).lean(),
        ).toMatchObject({ state: "failed", failureReason: "cancelled" });
    });

    it("resends a fresh code at most three times", async () => {
        const proposed = await (await propose()).json();
        const original = codeIn(mails()[0].body)!;
        for (let n = 1; n <= 3; n += 1) {
            const resent = await step(
                { action: "resend", pendingId: proposed.pending.pendingId },
                inMimic(),
            );
            expect(resent.status).toBe(200);
            expect((await resent.json()).kind).toBe("resent");
            expect(mails()).toHaveLength(1 + n);
        }
        const fourth = await step(
            { action: "resend", pendingId: proposed.pending.pendingId },
            inMimic(),
        );
        expect(fourth.status).toBe(400);
        expect((await fourth.json()).error.code).toBe("resend_limit");
        const latest = codeIn(mails()[3].body)!;
        const editor = await requireMimicEditor(new Headers({ cookie }), {
            subdomain: f.domain,
            user: f.admin,
            address: "https://school.example",
        } as any);
        if (latest !== original)
            expect(
                await confirmEmailChange(
                    editor,
                    new Headers(),
                    proposed.pending.pendingId,
                    original,
                ),
            ).toEqual({ kind: "wrong-code", attemptsLeft: 4 });
        const landed = await confirmEmailChange(
            editor,
            new Headers({ domain: f.domain.name }),
            proposed.pending.pendingId,
            latest,
        );
        expect(landed.kind).toBe("applied");
    });

    it("expires the code after ten minutes and after five wrong attempts", async () => {
        const proposed = await (await propose()).json();
        const code = codeIn(mails()[0].body)!;
        const editor = await requireMimicEditor(new Headers({ cookie }), {
            subdomain: f.domain,
            user: f.admin,
            address: "https://school.example",
        } as any);
        const wrongCode = code === "000000" ? "000001" : "000000";
        for (const left of [4, 3, 2, 1])
            expect(
                await confirmEmailChange(
                    editor,
                    new Headers(),
                    proposed.pending.pendingId,
                    wrongCode,
                ),
            ).toEqual({ kind: "wrong-code", attemptsLeft: left });
        const fifth = await confirmEmailChange(
            editor,
            new Headers(),
            proposed.pending.pendingId,
            wrongCode,
        );
        expect(fifth.kind).toBe("expired");
        expect(
            await MemberEditModel.findOne({
                editId: proposed.pending.pendingId,
            }).lean(),
        ).toMatchObject({ state: "failed", failureReason: "attempts" });

        (addMailJob as jest.Mock).mockClear();
        const again = await (await propose()).json();
        await MemberEditModel.updateOne(
            { editId: again.pending.pendingId },
            { expiresAt: new Date(Date.now() - 1) },
        );
        const snapshot = await (await get(inMimic())).json();
        expect(snapshot.snapshot.pendingEmail).toBeUndefined();
        const late = await step(
            {
                action: "confirm",
                pendingId: again.pending.pendingId,
                code: codeIn(mails()[0].body)!,
            },
            inMimic(),
        );
        expect(late.status).toBe(200);
        expect((await late.json()).kind).toBe("expired");
        expect(
            await MemberEditModel.findOne({
                editId: again.pending.pendingId,
            }).lean(),
        ).toMatchObject({ state: "failed", failureReason: "expired" });
        expect(
            ((await UserModel.findById(f.member._id).lean()) as any)?.email,
        ).toBe(f.member.email);
    });
});
