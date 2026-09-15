import { randomUUID } from "crypto";
import { graphql, GraphQLObjectType, GraphQLSchema } from "graphql";
import Domain from "@/models/Domain";
import User from "@/models/User";
import { ContactPreferencesModel } from "@/services/contact-preferences/model";
import { getUser, getUsers, updateUser } from "../logic";
import types from "../types";

jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
}));
jest.mock("../../notifications/logic", () => ({
    seedNotificationPreferencesForUser: jest.fn(),
}));
jest.mock("@/lib/record-activity", () => ({ recordActivity: jest.fn() }));
jest.mock("@/lib/trigger-sequences", () => ({ triggerSequences: jest.fn() }));
let domain: any, member: any, admin: any, other: any;
beforeEach(async () => {
    const id = randomUUID();
    domain = await Domain.create({
        name: id,
        email: `admin-${id}@example.com`,
    });
    member = await User.create({
        domain: domain._id,
        userId: `member-${id}`,
        email: `member-${id}@example.com`,
        name: "Member",
        bio: "Private bio",
        active: true,
        tags: ["private-tag"],
        permissions: [],
        avatar: {
            mediaId: "legacy-" + id,
            file: "https://cdn.example/legacy.jpg",
            access: "public",
            originalFileName: "legacy.jpg",
            mimeType: "image/jpeg",
            size: 128,
        },
    });
    admin = await User.create({
        domain: domain._id,
        userId: `admin-${id}`,
        email: domain.email,
        active: true,
        permissions: ["user:manage"],
    });
    other = await User.create({
        domain: domain._id,
        userId: `other-${id}`,
        email: `other-${id}@example.com`,
        active: true,
        permissions: [],
    });
});
const ctx = (user: any) => ({ subdomain: domain, user }) as any;

it.each(["guest", "other"])(
    "conceals member details and legacy media from %s generic lookups",
    async (kind) => {
        const value = await getUser(
            member.userId,
            ctx(kind === "guest" ? undefined : other),
        );
        expect(value).toMatchObject({ userId: member.userId, name: "Member" });
        for (const field of [
            "email",
            "bio",
            "avatar",
            "permissions",
            "tags",
            "purchases",
        ])
            expect(value[field]).toBeUndefined();
    },
);

it.each(["guest", "other", "self", "admin", "mimic"])(
    "guards raw nested GraphQL user fields for %s",
    async (kind) => {
        const context = ctx(
            kind === "guest"
                ? undefined
                : kind === "other"
                  ? other
                  : kind === "admin"
                    ? admin
                    : member,
        );
        if (kind === "mimic")
            context.memberMimic = { subjectUserId: member.userId };
        const schema = new GraphQLSchema({
            query: new GraphQLObjectType({
                name: "PrivacyQuery",
                fields: {
                    user: { type: types.userType, resolve: () => member },
                },
            }),
        });
        const result = await graphql({
            schema,
            source: "{user{name email bio permissions tags avatar{file thumbnail}}}",
            contextValue: context,
        });
        expect(result.errors).toBeUndefined();
        const value = result.data!.user as any;
        expect(value.avatar).toBeNull();
        if (["self", "admin", "mimic"].includes(kind))
            expect(value).toMatchObject({
                email: member.email,
                bio: "Private bio",
                tags: ["private-tag"],
            });
        else
            expect(value).toMatchObject({
                name: "Member",
                email: null,
                bio: null,
                permissions: null,
                tags: null,
            });
    },
);

it("refuses new legacy avatar writes and preserves the stored reference", async () => {
    const original = member.avatar.mediaId;
    for (const avatar of [null, { mediaId: "foreign-upload" }])
        await expect(
            updateUser({ id: member.userId, avatar } as any, ctx(member)),
        ).rejects.toThrow("private member photo");
    expect((await User.findById(member._id))!.avatar.mediaId).toBe(original);
});

it("batches only private photo presence for the authorized Users list", async () => {
    await ContactPreferencesModel.create({
        domain: domain._id,
        userId: member.userId,
        revision: 3,
        contact: { kind: "email", value: member.email },
        checkIns: "none",
        state: "active",
        photoVersion: 3,
        photoJpeg: Buffer.from("private-bytes"),
        updatedAt: new Date(),
    });
    const rows = await Promise.all(await getUsers({ ctx: ctx(admin) }));
    const row = rows.find((value) => value.userId === member.userId)!;
    expect(row.privatePhotoVersion).toBe(3);
    expect(row.photoJpeg).toBeUndefined();
    expect(row.avatar).toBeUndefined();
    await expect(getUsers({ ctx: ctx(other) })).rejects.toThrow();
});
