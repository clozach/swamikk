import { randomUUID } from "crypto";
import sharp from "sharp";
import * as photoService from "@/services/contact-preferences/photo";
import { NextRequest } from "next/server";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import CourseModel from "@/models/Course";
import MembershipModel from "@/models/Membership";
import { Constants } from "@courselit/common-models";
import { auth } from "@/auth";
import { startMemberMimic } from "@/services/member-mimic/session";
import { MEMBER_MIMIC_COOKIE } from "@/services/member-mimic/constants";
import { ContactPreferencesModel } from "@/services/contact-preferences/model";
import {
    readContactPreferences,
    readContactPhoto,
    saveContactPreferences,
} from "@/services/contact-preferences/service";
import {
    deleteUserContactPreferences,
    deleteTenantContactPreferences,
} from "@/services/contact-preferences/cleanup";
import { GET, PUT } from "../route";
import { GET as photoGet } from "../photo/route";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));

let domain: any, otherDomain: any, member: any, actor: any, ctx: any;
const choice = (revision = 0) => ({
    revision,
    contact: { kind: "email", value: "reply@example.com" },
    checkIns: "none",
    photo: { kind: "keep" },
});
function request(path = "", options: RequestInit = {}) {
    return new NextRequest(
        `https://school.example/api/contact-preferences${path}`,
        {
            ...options,
            signal: options.signal || undefined,
            headers: {
                domain: domain.name,
                host: "school.example",
                origin: "https://school.example",
                "content-type": "application/json",
                ...options.headers,
            },
        },
    );
}
async function jpeg() {
    return (
        await sharp({
            create: {
                width: 1024,
                height: 700,
                channels: 3,
                background: "red",
            },
        })
            .jpeg()
            .withMetadata()
            .toBuffer()
    ).toString("base64");
}

beforeEach(async () => {
    const suffix = randomUUID();
    domain = await DomainModel.create({
        name: `contact-${suffix}`,
        email: `owner-${suffix}@example.com`,
    });
    otherDomain = await DomainModel.create({
        name: `other-${suffix}`,
        email: "other@example.com",
    });
    member = await UserModel.create({
        domain: domain._id,
        email: `member-${suffix}@example.com`,
        userId: suffix,
        active: true,
    });
    actor = await UserModel.create({
        domain: domain._id,
        email: domain.email,
        userId: `actor-${suffix}`,
        active: true,
        permissions: ["user:manage"],
    });
    ctx = {
        subdomain: domain,
        user: member,
        address: "https://school.example",
    };
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: { email: member.email },
        session: { id: suffix },
    });
    await ContactPreferencesModel.init();
});

describe("private contact preferences", () => {
    it("defaults to saved email, no check-ins/photo, without creating records or changing news", async () => {
        expect(await readContactPreferences(ctx)).toEqual({
            revision: 0,
            contact: { kind: "email", value: member.email },
            checkIns: "none",
            photo: { kind: "none" },
        });
        expect(
            await ContactPreferencesModel.countDocuments({
                domain: domain._id,
            }),
        ).toBe(0);
        expect(
            (await UserModel.findById(member._id))!.subscribedToUpdates,
        ).toBe(false);
    });
    it.each(["email", "voice", "text"])(
        "saves matching %s details independently of sign-in and news",
        async (kind) => {
            const contact = {
                kind,
                value:
                    kind === "email"
                        ? "personal@example.com"
                        : "+64 21 123 4567",
            };
            const saved = await saveContactPreferences(
                { ...choice(), contact, checkIns: "occasional" },
                ctx,
            );
            expect(saved.contact).toEqual(contact);
            expect(saved.checkIns).toBe("occasional");
            expect((await UserModel.findById(member._id))!.email).toBe(
                member.email,
            );
        },
    );
    it("rejects invalid channels/details, unknown fields, and implicit photo consent", async () => {
        for (const input of [
            { ...choice(), contact: { kind: "zoom", value: "foo" } },
            { ...choice(), contact: { kind: "text", value: "not a phone" } },
            { ...choice(), public: true },
            {
                ...choice(),
                photo: { kind: "replace", mediaId: "public-avatar" },
            },
        ]) {
            await expect(saveContactPreferences(input, ctx)).rejects.toThrow();
        }
        expect(
            await ContactPreferencesModel.countDocuments({
                domain: domain._id,
            }),
        ).toBe(0);
    });
    it("allows one initial save under a race, then rejects stale revisions", async () => {
        const results = await Promise.allSettled([
            saveContactPreferences(choice(), ctx),
            saveContactPreferences(choice(), ctx),
        ]);
        expect(
            results.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(1);
        expect(
            await ContactPreferencesModel.countDocuments({
                domain: domain._id,
            }),
        ).toBe(1);
        await expect(
            saveContactPreferences(choice(), ctx),
        ).rejects.toMatchObject({ status: 409 });
    });
    it("stores only a bounded metadata-free JPEG and never returns bytes in preference data", async () => {
        const saved = await saveContactPreferences(
            { ...choice(), photo: { kind: "replace", data: await jpeg() } },
            ctx,
        );
        expect(saved.photo).toEqual({ kind: "shared", version: 1 });
        expect(Object.keys(saved).sort()).toEqual([
            "checkIns",
            "contact",
            "photo",
            "revision",
        ]);
        expect(
            (await ContactPreferencesModel.findOne({ domain: domain._id }))!
                .photoJpeg,
        ).toBeUndefined();
        const metadata = await sharp(await readContactPhoto(ctx)).metadata();
        expect(metadata.width).toBeLessThanOrEqual(512);
        expect(metadata.height).toBeLessThanOrEqual(512);
        expect(metadata.format).toBe("jpeg");
        expect(metadata.exif).toBeUndefined();
        expect(metadata.icc).toBeUndefined();
    });
    it("rejects SVG, undecodable bytes and excessive size", async () => {
        for (const data of [
            Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString(
                "base64",
            ),
            "aW52YWxpZA==",
            Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64"),
        ]) {
            await expect(
                saveContactPreferences(
                    { ...choice(), photo: { kind: "replace", data } },
                    ctx,
                ),
            ).rejects.toThrow();
        }
    });
    it("removes bytes atomically and a stale tab cannot restore the old photo", async () => {
        const data = await jpeg();
        await saveContactPreferences(
            { ...choice(), photo: { kind: "replace", data } },
            ctx,
        );
        await saveContactPreferences(
            { ...choice(1), photo: { kind: "remove" } },
            ctx,
        );
        await expect(
            saveContactPreferences(
                { ...choice(1), photo: { kind: "replace", data } },
                ctx,
            ),
        ).rejects.toMatchObject({ status: 409 });
        await expect(readContactPhoto(ctx)).rejects.toMatchObject({
            status: 404,
        });
        expect(
            (await ContactPreferencesModel.findOne({
                domain: domain._id,
            }).select("+photoJpeg"))!.photoJpeg,
        ).toBeUndefined();
    });
    it("rejects cross-tenant, inactive and anonymous access", async () => {
        await expect(
            readContactPreferences({ ...ctx, subdomain: otherDomain }),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
            readContactPreferences({ ...ctx, user: undefined }),
        ).rejects.toMatchObject({ status: 403 });
        await member.updateOne({ active: false });
        await expect(readContactPreferences(ctx)).rejects.toMatchObject({
            status: 403,
        });
    });
    it("ignores arbitrary target IDs and gates photo reads with no-store responses", async () => {
        await saveContactPreferences(
            { ...choice(), photo: { kind: "replace", data: await jpeg() } },
            ctx,
        );
        const response = await photoGet(request("/photo"));
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
            user: { email: actor.email },
            session: { id: "actor" },
        });
        expect(
            (await photoGet(request(`/photo?userId=${member.userId}`))).status,
        ).toBe(404);
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(null);
        expect((await GET(request())).status).toBe(403);
    });
    it("denies cross-origin writes and all Mimic mutation attempts", async () => {
        const body = JSON.stringify(choice());
        expect(
            (
                await PUT(
                    request("", {
                        method: "PUT",
                        body,
                        headers: { origin: "https://evil.example" },
                    }),
                )
            ).status,
        ).toBe(403);
        expect(
            (
                await PUT(
                    request("", {
                        method: "PUT",
                        body,
                        headers: { cookie: `${MEMBER_MIMIC_COOKIE}=invalid` },
                    }),
                )
            ).status,
        ).toBe(403);
        await expect(
            saveContactPreferences(choice(), { ...ctx, memberMimic: {} }),
        ).rejects.toMatchObject({ status: 403 });
    });
    it("shares preferences/photo in authorized Mimic, then revokes access on permission/session loss", async () => {
        await saveContactPreferences(
            { ...choice(), photo: { kind: "replace", data: await jpeg() } },
            ctx,
        );
        const courseId = randomUUID();
        await CourseModel.create({
            domain: domain._id,
            courseId,
            title: "Contact fixture",
            slug: courseId,
            creatorId: actor.userId,
            type: "course",
            published: true,
            cost: 0,
            costType: "free",
            privacy: "public",
            lessons: [],
            groups: [],
        });
        await MembershipModel.create({
            domain: domain._id,
            userId: member.userId,
            entityId: courseId,
            entityType: Constants.MembershipEntityType.COURSE,
            paymentPlanId: "free",
            status: Constants.MembershipStatus.ACTIVE,
        });
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
            user: { email: actor.email },
            session: { id: "support-session" },
        });
        const started = await startMemberMimic(
            { userId: member.userId },
            { ...ctx, user: actor },
            new Headers(),
        );
        const headers = { cookie: `${MEMBER_MIMIC_COOKIE}=${started.token}` };
        expect((await GET(request("", { headers }))).status).toBe(200);
        expect((await photoGet(request("/photo", { headers }))).status).toBe(
            200,
        );
        await actor.updateOne({ permissions: [] });
        expect((await photoGet(request("/photo", { headers }))).status).toBe(
            403,
        );
    });
    it("account cleanup erases contact/photo fields and tenant cleanup removes the marker", async () => {
        await saveContactPreferences(
            { ...choice(), photo: { kind: "replace", data: await jpeg() } },
            ctx,
        );
        await deleteUserContactPreferences(String(domain._id), member.userId);
        const erased = await ContactPreferencesModel.findOne({
            domain: domain._id,
        }).select("+photoJpeg");
        expect(erased!.state).toBe("deleted");
        expect(erased!.contact).toBeUndefined();
        expect(erased!.checkIns).toBeUndefined();
        expect(erased!.photoJpeg).toBeUndefined();
        await expect(readContactPreferences(ctx)).rejects.toMatchObject({
            status: 403,
        });
        await deleteTenantContactPreferences(String(domain._id));
        expect(
            await ContactPreferencesModel.countDocuments({
                domain: domain._id,
            }),
        ).toBe(0);
    });
    it("prevents an already-running initial photo save from recreating erased data", async () => {
        let entered!: () => void, release!: (photo: Buffer) => void;
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const resumed = new Promise<Buffer>((resolve) => {
            release = resolve;
        });
        const normalize = jest
            .spyOn(photoService, "privatePhotoJpeg")
            .mockImplementation(async () => {
                entered();
                return resumed;
            });
        const data = await jpeg();
        const pending = saveContactPreferences(
            { ...choice(), photo: { kind: "replace", data } },
            ctx,
        );
        await started; // The actual active-user read has already passed.
        await deleteUserContactPreferences(String(domain._id), member.userId);
        release(Buffer.from(data, "base64"));
        await expect(pending).rejects.toMatchObject({ status: 409 });
        normalize.mockRestore();
        const erased = await ContactPreferencesModel.findOne({
            domain: domain._id,
        }).select("+photoJpeg");
        expect(erased!.state).toBe("deleted");
        expect(erased!.photoJpeg).toBeUndefined();
        expect(erased!.contact).toBeUndefined();
        expect(
            await ContactPreferencesModel.countDocuments({
                domain: domain._id,
            }),
        ).toBe(1);
    });
});
