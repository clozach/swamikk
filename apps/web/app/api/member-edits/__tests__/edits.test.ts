import UserModel from "@/models/User";
import { MemberMimicModel } from "@/services/member-mimic/model";
import { MemberEditModel } from "@/services/member-edits/model";
import { ContactPreferencesModel } from "@/services/contact-preferences/model";
import { listMemberEdits } from "@/services/member-edits/history";
import { purgeMemberEdits } from "@/services/member-edits/cleanup";
import { cleanupPersonalData } from "@/graphql/users/helpers";
import { GET, POST } from "../route";
import { GET as history } from "../history/route";
import {
    type Fixture,
    change,
    mimic,
    request,
    seed,
    signInAs,
    teardown,
} from "./harness";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/queue", () => ({ addMailJob: jest.fn() }));
jest.mock("@/services/medialit", () => ({
    deleteMedia: jest.fn(),
    sealMedia: jest.fn(),
}));

describe("editing a member from Member Mimic", () => {
    let f: Fixture;
    let cookie: string;
    const get = (headers = {}) =>
        GET(request(f, "/api/member-edits", "GET", undefined, headers));
    const post = (body: unknown, headers = {}) =>
        POST(request(f, "/api/member-edits", "POST", body, headers));
    const inMimic = () => ({ cookie });

    beforeEach(async () => {
        f = await seed();
        cookie = await mimic(f, f.member);
    });
    afterEach(async () => {
        await teardown(f);
    });

    it("refuses without a Mimic view and when the view has expired", async () => {
        const plain = await get();
        expect(plain.status).toBe(403);
        expect((await plain.json()).error.code).toBe("forbidden");
        const write = await post({
            changes: [change("name", "Member", "Someone")],
        });
        expect(write.status).toBe(403);
        expect((await write.json()).error.code).toBe("forbidden");
        await MemberMimicModel.updateOne(
            { subjectUserId: f.member.userId },
            { expiresAt: new Date(Date.now() - 1) },
        );
        const expired = await get(inMimic());
        expect(expired.status).toBe(403);
        expect((await expired.json()).error.code).toBe("mimic_expired");
        expect(
            (await UserModel.findById(f.member._id).lean()) as any,
        ).toMatchObject({
            name: "Member",
        });
        expect(
            await MemberEditModel.countDocuments({ domain: f.domain._id }),
        ).toBe(0);
    });

    it("reads a fresh snapshot with the contact default at revision 0 and the email locks", async () => {
        const response = await get(inMimic());
        expect(response.status).toBe(200);
        const { snapshot } = await response.json();
        expect(snapshot).toEqual({
            subject: {
                userId: f.member.userId,
                name: "Member",
                email: f.member.email,
            },
            contact: {
                kind: "email",
                value: f.member.email,
                checkIns: "none",
                revision: 0,
            },
            actor: {
                userId: f.admin.userId,
                name: "Support Admin",
                canReviewRefunds: false,
            },
        });
        expect(snapshot.emailLock).toBeUndefined();
        expect(snapshot.pendingEmail).toBeUndefined();

        const ownerView = await mimic(f, f.owner);
        const owner = await (await get({ cookie: ownerView })).json();
        expect(owner.snapshot.emailLock).toBe("owner");
        const selfView = await mimic(f, f.admin);
        const self = await (await get({ cookie: selfView })).json();
        expect(self.snapshot.emailLock).toBe("self");

        signInAs(f.owner, "owner-session");
        const asOwner = await mimic(f, f.member, f.owner);
        const reviewer = await (await get({ cookie: asOwner })).json();
        expect(reviewer.snapshot.actor).toEqual({
            userId: f.owner.userId,
            name: "Owner",
            canReviewRefunds: true,
        });
    });

    it("applies a name change as the admin without touching the member's timestamps", async () => {
        const before = (await UserModel.findById(f.member._id).lean()) as any;
        const response = await post(
            { changes: [change("name", "Member", "  Renamed Member ")] },
            inMimic(),
        );
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.kind).toBe("applied");
        expect(body.edit).toMatchObject({
            subjectUserId: f.member.userId,
            editorUserId: f.admin.userId,
            changes: [change("name", "Member", "Renamed Member")],
        });
        expect(body.edit.undoOf).toBeUndefined();
        expect(body.edit.emailVerification).toBeUndefined();
        expect(body.snapshot.subject.name).toBe("Renamed Member");
        const record = await MemberMimicModel.findOne({
            subjectUserId: f.member.userId,
        });
        expect(body.edit.mimicId).toBe(record?.id);
        const row = await MemberEditModel.findOne({
            editId: body.edit.editId,
        }).lean();
        expect(row).toMatchObject({
            state: "applied",
            editorUserId: f.admin.userId,
            subjectUserId: f.member.userId,
            mimicId: record?.id,
        });
        const after = (await UserModel.findById(f.member._id).lean()) as any;
        expect(after?.name).toBe("Renamed Member");
        expect(after?.updatedAt).toEqual(before?.updatedAt);
        for (const key of ["codeHash", "codeSalt", "attempts", "state"])
            expect(JSON.stringify(body)).not.toContain(`"${key}"`);
    });

    it("answers 409 with the current values when a before is stale, writing nothing", async () => {
        const response = await post(
            { changes: [change("name", "Somebody Else", "Renamed")] },
            inMimic(),
        );
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
            error: {
                code: "stale",
                message:
                    "This member's record changed elsewhere; the panel now shows the current values.",
            },
            current: [{ field: "name", value: "Member" }],
        });
        expect(
            ((await UserModel.findById(f.member._id).lean()) as any)?.name,
        ).toBe("Member");
        expect(
            await MemberEditModel.countDocuments({ domain: f.domain._id }),
        ).toBe(0);
    });

    it("validates the set: email alone, unique fields, a whole contact pair, a real name", async () => {
        const bad = async (body: unknown, code = "bad_request") => {
            const response = await post(body, inMimic());
            expect(response.status).toBe(400);
            expect((await response.json()).error.code).toBe(code);
        };
        await bad({
            changes: [
                change("email", f.member.email, "new@example.com"),
                change("name", "Member", "Other"),
            ],
        });
        await bad({
            changes: [
                change("name", "Member", "A"),
                change("name", "Member", "B"),
            ],
        });
        await bad({ changes: [] });
        await bad({ changes: [change("checkIns", "none", "weekly")] });
        await bad({ changes: [change("contact.kind", "email", "fax")] });
        // voice with an email-shaped value: the pair must agree.
        await bad({ changes: [change("contact.kind", "email", "voice")] });
        await bad({ changes: [change("name", "Member", "   ")] });
        await bad(
            { changes: [change("name", "Member", "Member")] },
            "no_change",
        );
        await bad({ changes: [change("name", "Member", "X")], extra: 1 });
        expect(
            await MemberEditModel.countDocuments({ domain: f.domain._id }),
        ).toBe(0);
    });

    it("applies contact kind and value together at revision 1, then check-ins at revision 2", async () => {
        const first = await post(
            {
                changes: [
                    change("contact.kind", "email", "text"),
                    change("contact.value", f.member.email, "+1 555 010 0100"),
                ],
            },
            inMimic(),
        );
        expect(first.status).toBe(200);
        const one = await first.json();
        expect(one.snapshot.contact).toEqual({
            kind: "text",
            value: "+1 555 010 0100",
            checkIns: "none",
            revision: 1,
        });
        const second = await post(
            { changes: [change("checkIns", "none", "occasional")] },
            inMimic(),
        );
        expect(second.status).toBe(200);
        const two = await second.json();
        expect(two.snapshot.contact).toEqual({
            kind: "text",
            value: "+1 555 010 0100",
            checkIns: "occasional",
            revision: 2,
        });
        const stored = await ContactPreferencesModel.findOne({
            domain: f.domain._id,
            userId: f.member.userId,
        }).lean();
        expect(stored).toMatchObject({
            state: "active",
            revision: 2,
            contact: { kind: "text", value: "+1 555 010 0100" },
            checkIns: "occasional",
        });
        // A value that no longer fits its kind is refused as a pair.
        const mismatch = await post(
            { changes: [change("contact.kind", "text", "email")] },
            inMimic(),
        );
        expect(mismatch.status).toBe(400);
    });

    it("records a reversal as its own row naming undoOf, and refuses another member's row", async () => {
        const original = await (
            await post(
                { changes: [change("name", "Member", "Renamed")] },
                inMimic(),
            )
        ).json();
        const undo = await post(
            {
                changes: [change("name", "Renamed", "Member")],
                undoOf: original.edit.editId,
            },
            inMimic(),
        );
        expect(undo.status).toBe(200);
        const reversed = await undo.json();
        expect(reversed.edit.undoOf).toBe(original.edit.editId);
        expect(reversed.snapshot.subject.name).toBe("Member");
        const listed = await (
            await history(
                request(
                    f,
                    "/api/member-edits/history",
                    "GET",
                    undefined,
                    inMimic(),
                ),
            )
        ).json();
        expect(listed.edits.map((edit: any) => edit.editId)).toEqual([
            reversed.edit.editId,
            original.edit.editId,
        ]);
        expect(listed.edits[0].undoOf).toBe(original.edit.editId);

        const other = await UserModel.create({
            domain: f.domain._id,
            userId: `other-${f.suffix}`,
            email: `other-${f.suffix}@example.com`,
            name: "Other",
            active: true,
            unsubscribeToken: `other-${f.suffix}`,
        });
        const otherView = await mimic(f, other);
        const foreign = await (
            await post(
                { changes: [change("name", "Other", "Changed")] },
                { cookie: otherView },
            )
        ).json();
        const crossed = await post(
            {
                changes: [change("name", "Member", "Whatever")],
                undoOf: foreign.edit.editId,
            },
            { cookie: await mimic(f, f.member) },
        );
        expect(crossed.status).toBe(404);
        expect((await crossed.json()).error.code).toBe("not_found");
    });

    it("lists history newest first with the editor resolved, paging across a boundary of two", async () => {
        const names = ["First", "Second", "Third"];
        let previous = "Member";
        const ids: string[] = [];
        for (const name of names) {
            const body = await (
                await post(
                    { changes: [change("name", previous, name)] },
                    inMimic(),
                )
            ).json();
            ids.push(body.edit.editId);
            previous = name;
        }
        const ctx = {
            subdomain: f.domain,
            user: f.admin,
            address: "https://school.example",
        } as any;
        const headers = new Headers({ cookie });
        const first = await listMemberEdits(headers, ctx, { limit: 2 });
        expect(first.edits.map((edit) => edit.editId)).toEqual([
            ids[2],
            ids[1],
        ]);
        expect(first.edits[0].editor).toEqual({
            userId: f.admin.userId,
            name: "Support Admin",
            email: f.admin.email,
        });
        expect(first.nextCursor).toEqual(expect.any(String));
        const second = await listMemberEdits(headers, ctx, {
            limit: 2,
            before: first.nextCursor!,
        });
        expect(second.edits.map((edit) => edit.editId)).toEqual([ids[0]]);
        expect(second.nextCursor).toBeNull();
        const viaRoute = await history(
            request(
                f,
                `/api/member-edits/history?before=${encodeURIComponent(first.nextCursor!)}`,
                "GET",
                undefined,
                inMimic(),
            ),
        );
        expect(viaRoute.status).toBe(200);
        const paged = await viaRoute.json();
        expect(paged.edits).toHaveLength(1);
        for (const row of paged.edits)
            expect(Object.keys(row)).not.toEqual(
                expect.arrayContaining(["state", "codeHash"]),
            );
        const junk = await history(
            request(
                f,
                "/api/member-edits/history?before=junk",
                "GET",
                undefined,
                inMimic(),
            ),
        );
        expect(junk.status).toBe(400);
    });

    it("purges the member's rows at erasure", async () => {
        await post(
            { changes: [change("name", "Member", "Renamed")] },
            inMimic(),
        );
        expect(
            await MemberEditModel.countDocuments({
                domain: f.domain._id,
                subjectUserId: f.member.userId,
            }),
        ).toBe(1);
        await purgeMemberEdits(String(f.domain._id), f.member.userId);
        expect(
            await MemberEditModel.countDocuments({ domain: f.domain._id }),
        ).toBe(0);
        await post(
            { changes: [change("name", "Renamed", "Again")] },
            inMimic(),
        );
        await cleanupPersonalData(f.member, {
            subdomain: f.domain,
            user: f.admin,
            address: "https://school.example",
        } as any);
        expect(
            await MemberEditModel.countDocuments({ domain: f.domain._id }),
        ).toBe(0);
        expect(await UserModel.findById(f.member._id)).toBeNull();
    });
});
