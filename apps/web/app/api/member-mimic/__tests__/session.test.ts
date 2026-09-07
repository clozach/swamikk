import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { parse } from "graphql";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import CourseModel from "@/models/Course";
import LessonModel from "@/models/Lesson";
import CommunityModel from "@/models/Community";
import { Constants } from "@courselit/common-models";
import MembershipModel from "@/models/Membership";
import { POST as graphPost } from "../../graph/route";
import { getCachedDomain } from "@/lib/domain-cache";
import { getUserContent } from "@/graphql/users/logic";
import {
    revokeMemberMimicForUser,
    deleteTenantMemberMimicData,
} from "@/services/member-mimic/cleanup";
import { auth } from "@/auth";
import { MemberMimicModel } from "@/services/member-mimic/model";
import {
    startMemberMimic,
    exitMemberMimic,
} from "@/services/member-mimic/session";
import {
    assertNoMemberMimicMutation,
    resolveMemberReadContext,
} from "@/services/member-mimic/context";
import {
    MEMBER_MIMIC_COOKIE,
    safeMimicReturnTo,
    isMemberMimicPath,
} from "@/services/member-mimic/constants";
import { prepareMimicQuery } from "@/services/member-mimic/graphql";
import { POST, GET, DELETE } from "../route";

jest.mock("@/graphql", () => jest.requireActual("../../../../graphql"), {
    virtual: true,
});
jest.mock(
    "@/async-local-storage",
    () => jest.requireActual("../../../../async-local-storage"),
    { virtual: true },
);
jest.mock("@/lib/domain-cache", () => ({ getCachedDomain: jest.fn() }));
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    deleteMedia: jest.fn(),
    sealMedia: jest.fn(),
}));

describe("Member Mimic identity, expiry and read boundary", () => {
    let domain: any, otherDomain: any, actor: any, member: any, ctx: any;
    let sessionId: string;
    const cookie = (token: string) =>
        new Headers({ cookie: `${MEMBER_MIMIC_COOKIE}=${token}` });

    beforeEach(async () => {
        const suffix = randomUUID();
        sessionId = randomUUID();
        domain = await DomainModel.create({
            name: `mimic-${suffix}`,
            email: `admin-${suffix}@example.com`,
        });
        otherDomain = await DomainModel.create({
            name: `mimic-other-${suffix}`,
            email: `other-${suffix}@example.com`,
        });
        actor = await UserModel.create({
            domain: domain._id,
            userId: `admin-${suffix}`,
            email: domain.email,
            active: true,
            permissions: ["user:manage"],
            unsubscribeToken: `admin-token-${suffix}`,
        });
        member = await UserModel.create({
            domain: domain._id,
            userId: `member-${suffix}`,
            email: `member-${suffix}@example.com`,
            name: "Member",
            bio: "Shared biography",
            active: true,
            permissions: ["course:manage"],
            unsubscribeToken: `secret-${suffix}`,
            tags: ["private-operator-tag"],
            purchases: [
                {
                    courseId: `course-${suffix}`,
                    completedLessons: ["private-practice"],
                    accessibleGroups: ["released"],
                    certificateId: "private-certificate",
                    lastDripAt: new Date(),
                    createdAt: new Date(),
                },
            ],
        });
        ctx = {
            subdomain: domain,
            user: actor,
            address: "https://school.example",
        };
        (getCachedDomain as jest.Mock).mockResolvedValue(domain);
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
            user: { email: actor.email },
            session: { id: sessionId },
        });
    });
    afterEach(async () => {
        await MemberMimicModel.deleteMany({
            domain: { $in: [domain._id, otherDomain._id] },
        });
        await UserModel.deleteMany({
            domain: { $in: [domain._id, otherDomain._id] },
        });
        await CourseModel.deleteMany({
            domain: { $in: [domain._id, otherDomain._id] },
        });
        await LessonModel.deleteMany({
            domain: { $in: [domain._id, otherDomain._id] },
        });
        await CommunityModel.deleteMany({
            domain: { $in: [domain._id, otherDomain._id] },
        });
        await MembershipModel.deleteMany({
            domain: { $in: [domain._id, otherDomain._id] },
        });
        await DomainModel.deleteMany({
            _id: { $in: [domain._id, otherDomain._id] },
        });
    });

    it("creates an admin-attributed view without any member session or activity writes", async () => {
        const before = await UserModel.findById(member._id).lean();
        const started = await startMemberMimic(
            { userId: member.userId, returnTo: "/dashboard/users?page=2" },
            ctx,
            new Headers(),
        );
        const resolved = await resolveMemberReadContext(
            cookie(started.token),
            ctx,
        );
        expect(resolved.kind).toBe("mimic");
        if (resolved.kind !== "mimic") throw new Error("Expected member view");
        expect(resolved.context.user.userId).toBe(member.userId);
        expect((resolved.context as any).actor.userId).toBe(actor.userId);
        expect(resolved.context.user.permissions).toEqual([]);
        expect(resolved.context.user.purchases[0].accessibleGroups).toEqual([
            "released",
        ]);
        expect(resolved.context.user.purchases[0].completedLessons).toEqual([]);
        expect(
            resolved.context.user.purchases[0].certificateId,
        ).toBeUndefined();
        expect(resolved.context.user.purchases[0].lastDripAt).toEqual(
            member.purchases[0].lastDripAt,
        );
        expect((resolved.context.user as any).unsubscribeToken).toBeUndefined();
        expect((resolved.context.user as any).tags).toBeUndefined();
        expect((resolved.context.user as any).save).toBeUndefined();
        expect(await UserModel.findById(member._id).lean()).toEqual(before);
        expect(resolved.view.returnTo).toBe("/dashboard/users?page=2");
        const record = await MemberMimicModel.findOne({
            subjectUserId: member.userId,
        });
        expect(record?.actorUserId).toBe(actor.userId);
        expect(record?.tokenHash).not.toBe(started.token);
    });

    it("rejects non-managers, foreign members, and inactive accounts", async () => {
        await expect(
            startMemberMimic(
                { userId: member.userId },
                { ...ctx, user: member },
                new Headers(),
            ),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
            startMemberMimic(
                { userId: member.userId },
                { ...ctx, subdomain: otherDomain },
                new Headers(),
            ),
        ).rejects.toMatchObject({ code: "forbidden" });
        await UserModel.updateOne({ _id: member._id }, { active: false });
        await expect(
            startMemberMimic({ userId: member.userId }, ctx, new Headers()),
        ).rejects.toMatchObject({ code: "not_found" });
    });

    it("binds the token to the actor's current session and tenant", async () => {
        const started = await startMemberMimic(
            { userId: member.userId },
            ctx,
            new Headers(),
        );
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
            user: { email: actor.email },
            session: { id: "different-session" },
        });
        expect(
            (await resolveMemberReadContext(cookie(started.token), ctx)).kind,
        ).toBe("expired");
        expect(
            (
                await resolveMemberReadContext(cookie(started.token), {
                    ...ctx,
                    subdomain: otherDomain,
                })
            ).kind,
        ).toBe("expired");
        expect((await resolveMemberReadContext(new Headers(), ctx)).kind).toBe(
            "ordinary",
        );
        expect(
            (await resolveMemberReadContext(cookie("invalid"), ctx)).kind,
        ).toBe("expired");
    });

    it("rechecks expiry and permission and revokes old deep-link tokens after Exit", async () => {
        const started = await startMemberMimic(
            { userId: member.userId },
            ctx,
            new Headers(),
        );
        expect(() =>
            assertNoMemberMimicMutation(cookie(started.token)),
        ).toThrow("Exit Member Mimic");
        expect(
            (
                await resolveMemberReadContext(cookie(started.token), {
                    ...ctx,
                    user: { ...actor.toObject(), permissions: [] },
                })
            ).kind,
        ).toBe("expired");
        await MemberMimicModel.updateOne(
            { subjectUserId: member.userId },
            { expiresAt: new Date(Date.now() - 1) },
        );
        expect(
            (await resolveMemberReadContext(cookie(started.token), ctx)).kind,
        ).toBe("expired");
        await exitMemberMimic(
            cookie(started.token),
            String(domain._id),
            actor.userId,
        );
        expect(
            (await resolveMemberReadContext(cookie(started.token), ctx)).kind,
        ).toBe("expired");
        expect(
            (await MemberMimicModel.findOne({ subjectUserId: member.userId }))
                ?.state.kind,
        ).toBe("revoked");
    });

    it("forces published member course reads and rejects mutation/private-query escape routes", () => {
        const safe = prepareMimicQuery(
            "query View($id: String!, $preview: Boolean) { c: getCourse(id: $id, preview: $preview) { title lessons { title } } }",
        );
        expect(safe).toContain("asGuest: true");
        expect(safe).toContain("preview: false");
        expect(safe).not.toContain("$preview");
        expect(() => parse(safe)).not.toThrow();
        for (const source of [
            'mutation { markLessonCompleted(id: "x") }',
            'query { inviteCustomer(email: "x@example.com", id: "x") { userId } }',
            "query { getUser { tags updatedAt } }",
            'query { getCourse(id: "x") { groups { drip { email { subject } } } } }',
            'query { getMembershipStatus(entityId: "private", entityType: COMMUNITY) }',
            "query { __schema { types { name } } }",
            "query { getUser { ...Secrets } } fragment Secrets on User { tags }",
        ])
            expect(() => prepareMimicQuery(source)).toThrow();
    });

    it("rejects encoded and trailing-slash private discussion routes", () => {
        for (const path of [
            "/course/shared/id/discussions/",
            "/course/shared/id/%64iscussions",
            "/course/shared/id%2fdiscussions",
            "/course/%zz/id",
        ])
            expect(isMemberMimicPath(path)).toBe(false);
        expect(isMemberMimicPath("/course/shared/id/lesson")).toBe(true);
    });

    it("bounds return destinations to the member list", () => {
        for (const path of [
            "https://attacker.example",
            "//attacker.example",
            "/dashboard/users/other",
            "/checkout",
            "/dashboard/users#hidden",
            "/dashboard/users\n",
        ])
            expect(safeMimicReturnTo(path)).toBe("/dashboard/users");
        expect(safeMimicReturnTo("/dashboard/users?search=member&page=3")).toBe(
            "/dashboard/users?search=member&page=3",
        );
    });

    it("uses an HttpOnly cookie and lets an expired browser explicitly exit", async () => {
        const headers = {
            domain: domain.name,
            origin: "https://school.example",
            "content-type": "application/json",
        };
        const bad = await POST(
            new NextRequest("https://school.example/api/member-mimic", {
                method: "POST",
                headers: { ...headers, origin: "https://attacker.example" },
                body: JSON.stringify({ userId: member.userId }),
            }),
        );
        expect(bad.status).toBe(403);
        const start = await POST(
            new NextRequest("https://school.example/api/member-mimic", {
                method: "POST",
                headers,
                body: JSON.stringify({ userId: member.userId }),
            }),
        );
        expect(start.status).toBe(201);
        expect(start.headers.get("set-cookie")).toContain("HttpOnly");
        expect(start.headers.get("set-cookie")).toContain("SameSite=strict");
        const body = await start.json();
        expect(body.token).toBeUndefined();
        const cookieHeader = start.headers.get("set-cookie")!.split(";")[0];
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(null);
        const read = await GET(
            new NextRequest("https://school.example/api/member-mimic", {
                headers: { ...headers, cookie: cookieHeader },
            }),
        );
        expect((await read.json()).mimic.kind).toBe("expired");
        const exit = await DELETE(
            new NextRequest("https://school.example/api/member-mimic", {
                method: "DELETE",
                headers: { ...headers, cookie: cookieHeader },
            }),
        );
        expect(exit.status).toBe(200);
        expect(exit.headers.get("set-cookie")).toContain("Max-Age=0");
    });
    it("projects explicit getUser requests at the real GraphQL boundary and never records a view as activity", async () => {
        const started = await startMemberMimic(
            { userId: member.userId },
            ctx,
            new Headers(),
        );
        const beforeMember = await UserModel.findById(member._id).lean();
        const beforeActor = await UserModel.findById(actor._id).lean();
        const query = `query { getUser(userId: "${member.userId}") { id userId name permissions purchases { completedLessons certificateId lastDripAt accessibleGroups } } }`;
        const request = (query: string, token = started.token) =>
            new NextRequest("https://school.example/api/graph", {
                method: "POST",
                headers: {
                    domain: domain.name,
                    cookie: `${MEMBER_MIMIC_COOKIE}=${token}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({ query }),
            });
        const result = await (await graphPost(request(query))).json();
        expect(result.errors).toBeUndefined();
        expect(result.data.getUser.userId).toBe(member.userId);
        expect(result.data.getUser.purchases[0]).toEqual({
            completedLessons: [],
            certificateId: null,
            lastDripAt: expect.any(String),
            accessibleGroups: ["released"],
        });
        const mutation = await graphPost(
            request(
                `mutation { updateUser(userData: { id: "${member.userId}", name: "Counterfeit change" }) { name } }`,
            ),
        );
        expect(mutation.status).toBe(403);
        const another = await (
            await graphPost(
                request(
                    `query { getUser(userId: "${actor.userId}") { email } }`,
                ),
            )
        ).json();
        expect(another.errors).toBeDefined();
        expect((await graphPost(request(query, "invalid"))).status).toBe(403);
        expect(await UserModel.findById(member._id).lean()).toEqual(
            beforeMember,
        );
        expect(await UserModel.findById(actor._id).lean()).toEqual(beforeActor);
    });

    it("hides draft lessons and draft-only groups even when the subject owns the course", async () => {
        const courseId = member.purchases[0].courseId;
        await CourseModel.create({
            domain: domain._id,
            courseId,
            title: "Shared course",
            creatorId: member.userId,
            slug: "shared",
            published: true,
            type: "course",
            cost: 0,
            costType: "free",
            privacy: "public",
            groups: [
                {
                    _id: "released",
                    name: "Released",
                    rank: 0,
                    lessonsOrder: ["published-lesson", "draft-lesson"],
                },
                {
                    _id: "drafts",
                    name: "Private future group",
                    rank: 1,
                    lessonsOrder: ["private-future"],
                },
            ],
        });
        for (const [lessonId, groupId, published] of [
            ["published-lesson", "released", true],
            ["draft-lesson", "released", false],
            ["private-future", "drafts", false],
        ] as const)
            await LessonModel.create({
                domain: domain._id,
                courseId,
                lessonId,
                title: lessonId,
                creatorId: member.userId,
                groupId,
                type: "text",
                published,
                requiresEnrollment: false,
                content: { type: "doc", content: [] },
            });
        const started = await startMemberMimic(
            { userId: member.userId },
            ctx,
            new Headers(),
        );
        const response = await graphPost(
            new NextRequest("https://school.example/api/graph", {
                method: "POST",
                headers: {
                    domain: domain.name,
                    cookie: `${MEMBER_MIMIC_COOKIE}=${started.token}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    query: `query { getCourse(id: "${courseId}", preview: true) { title isPreview groups { name lessonsOrder } lessons { lessonId } } }`,
                }),
            }),
        );
        const result = await response.json();
        expect(result.errors).toBeUndefined();
        expect(result.data.getCourse.isPreview).toBe(false);
        expect(result.data.getCourse.groups).toEqual([
            { name: "Released", lessonsOrder: ["published-lesson"] },
        ]);
        expect(result.data.getCourse.lessons).toEqual([
            { lessonId: "published-lesson" },
        ]);
    });

    it("omits community membership and progress from My content, and revokes only the matching tenant during cleanup", async () => {
        const started = await startMemberMimic(
            { userId: member.userId },
            ctx,
            new Headers(),
        );
        const resolved = await resolveMemberReadContext(
            cookie(started.token),
            ctx,
        );
        if (resolved.kind !== "mimic") throw new Error("Expected member view");
        const courseId = member.purchases[0].courseId;
        await CourseModel.create({
            domain: domain._id,
            courseId,
            title: "Member course",
            creatorId: actor.userId,
            slug: "member-course",
            published: true,
            type: "course",
            cost: 0,
            costType: "free",
            privacy: "public",
        });
        await CommunityModel.create({
            domain: domain._id,
            communityId: "private-community",
            name: "Private group",
            slug: "private-group",
            pageId: "private-page",
        });
        for (const [entityId, entityType] of [
            [courseId, Constants.MembershipEntityType.COURSE],
            ["private-community", Constants.MembershipEntityType.COMMUNITY],
        ])
            await MembershipModel.create({
                membershipId: randomUUID(),
                domain: domain._id,
                userId: member.userId,
                entityId,
                entityType,
                paymentPlanId: "free",
                status: Constants.MembershipStatus.ACTIVE,
            });
        const content = await getUserContent(resolved.context, member.userId);
        expect(content).toHaveLength(1);
        expect(content[0].entity).toMatchObject({
            id: courseId,
            completedLessonsCount: null,
            certificateId: null,
        });
        await expect(
            getUserContent(resolved.context, actor.userId),
        ).rejects.toThrow();
        await revokeMemberMimicForUser(String(otherDomain._id), member.userId);
        expect(
            (await resolveMemberReadContext(cookie(started.token), ctx)).kind,
        ).toBe("mimic");
        await revokeMemberMimicForUser(String(domain._id), member.userId);
        expect(
            (await resolveMemberReadContext(cookie(started.token), ctx)).kind,
        ).toBe("expired");
        await deleteTenantMemberMimicData(String(domain._id));
        expect(
            await MemberMimicModel.countDocuments({ domain: domain._id }),
        ).toBe(0);
    });
});
