import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import CourseModel from "@/models/Course";
import LessonModel from "@/models/Lesson";
import { Constants } from "@courselit/common-models";
import {
    createDripChange,
    approveDripChange,
    refreshDripChange,
    reconcileDripChange,
    restoreDripChange,
    discardDripChange,
} from "@/services/drip-admin/changes";
import { DripChangeModel } from "@/services/drip-admin/models";
import { listDripCourses, readDripCourse } from "@/services/drip-admin/read";
import {
    deleteUserDripChanges,
    deleteTenantDripChanges,
} from "@/services/drip-admin/cleanup";
import {
    AccessMembershipModel,
    MembershipAccessModel,
} from "../../../../../../packages/common-logic/src/member-access/models";
import { resolveDripSchedule } from "../../../../../../packages/common-logic/src/drip-schedule";
import { POST, GET } from "../route";
import { POST as action } from "../[id]/route";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@courselit/email-editor", () => ({
    renderEmailToHtml: jest
        .fn()
        .mockResolvedValue("<p>Time to practice {{ subscriber.name }}</p>"),
}));

describe("O11 approved native release schedules", () => {
    let domain: any,
        admin: any,
        member: any,
        course: any,
        ctx: any,
        period: any;
    const day = 86400000;
    beforeEach(async () => {
        jest.restoreAllMocks();
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(null);
        const suffix = randomUUID();
        domain = await DomainModel.create({
            name: `drip-${suffix}`,
            email: `owner-${suffix}@example.com`,
        });
        admin = await UserModel.create({
            domain: domain._id,
            userId: `admin-${suffix}`,
            email: domain.email,
            active: true,
            permissions: ["course:manage_any"],
        });
        course = await CourseModel.create({
            domain: domain._id,
            courseId: `course-${suffix}`,
            title: "Practice",
            slug: `practice-${suffix}`,
            creatorId: admin.userId,
            type: "course",
            privacy: "unlisted",
            costType: "free",
            cost: 0,
            published: true,
            groups: [
                {
                    _id: "one",
                    name: "One",
                    rank: 1000,
                    lessonsOrder: ["lesson-one"],
                    drip: {
                        status: true,
                        type: "relative-date",
                        delayInMillis: 10 * day,
                        email: {
                            content: {
                                content: [],
                                style: {
                                    colors: { background: "#fff" },
                                    typography: { fontFamily: "Arial" },
                                    structure: { width: 600 },
                                },
                                meta: {},
                            },
                            subject: "Practice is ready",
                            published: true,
                        },
                    },
                },
                {
                    _id: "two",
                    name: "Two",
                    rank: 2000,
                    lessonsOrder: [],
                    drip: {
                        status: true,
                        type: "relative-date",
                        delayInMillis: day,
                    },
                },
            ],
        });
        await LessonModel.create({
            domain: domain._id,
            lessonId: "lesson-one",
            courseId: course.courseId,
            groupId: "one",
            title: "Practice one",
            type: "text",
            creatorId: admin.userId,
            content: { type: "doc", content: [] },
            requiresEnrollment: true,
            published: true,
            publication: {
                kind: "known",
                firstPublishedAt: new Date(Date.now() - day),
                source: "native",
            },
        });
        member = await UserModel.create({
            domain: domain._id,
            userId: `member-${suffix}`,
            email: `member-${suffix}@example.com`,
            active: true,
            permissions: [],
            purchases: [
                {
                    courseId: course.courseId,
                    accessibleGroups: [],
                    completedLessons: [],
                    createdAt: new Date(Date.now() - 2 * day),
                },
            ],
        });
        await AccessMembershipModel.create({
            domain: domain._id,
            membershipId: "membership",
            sessionId: "session",
            userId: member.userId,
            entityId: course.courseId,
            entityType: Constants.MembershipEntityType.COURSE,
            status: Constants.MembershipStatus.ACTIVE,
            paymentPlanId: "plan",
            accessActivation: {
                sessionId: "session",
                startedAt: new Date(Date.now() - 2 * day),
            },
        });
        period = await MembershipAccessModel.create({
            domain: domain._id,
            id: randomUUID(),
            userId: member.userId,
            courseId: course.courseId,
            membershipId: "membership",
            membershipSessionId: "session",
            start: { kind: "recorded", at: new Date(Date.now() - 2 * day) },
            state: { kind: "active" },
            groupReleases: [],
            deliveries: [],
            revision: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        ctx = {
            user: admin,
            subdomain: domain,
            address: "https://school.example",
        };
        await DripChangeModel.init();
    });
    afterEach(async () => {
        jest.restoreAllMocks();
        for (const model of [
            AccessMembershipModel,
            MembershipAccessModel,
            CourseModel,
            LessonModel,
            UserModel,
            DripChangeModel,
        ] as any[])
            await model.deleteMany({ domain: domain._id });
        await DomainModel.deleteOne({ _id: domain._id });
    });
    const patch = () => ({
        groupId: "one",
        rule: { kind: "relative" as const, delayInMillis: day },
        groupOrder: ["one", "two"],
        notificationEnabled: true,
    });
    const create = () =>
        createDripChange({ courseId: course.courseId, patch: patch() }, ctx);
    const request = (body: unknown, extra: Record<string, string> = {}) =>
        new NextRequest("https://school.example/api/drip-admin", {
            method: "POST",
            headers: {
                domain: domain.name,
                origin: "https://school.example",
                host: "school.example",
                "content-type": "application/json",
                ...extra,
            },
            body: JSON.stringify(body),
        });
    async function asAdmin() {
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
            user: { email: admin.email },
        });
    }

    it("keeps a draft separate from native rules and shows consequences without member identities", async () => {
        const change = await create();
        expect(change.state.kind).toBe("draft");
        expect(change.preview.impact).toMatchObject({
            activeMembers: 1,
            newlyAvailableNow: 1,
            notificationRecipientsNow: 1,
            notificationSectionIds: ["one"],
        });
        expect(change.preview.after[0].notification?.html).toContain(
            "subscriber.name",
        );
        expect(JSON.stringify(change.preview)).not.toContain(member.email);
        expect(
            (await CourseModel.findById(course._id))!.groups![0].drip!
                .delayInMillis,
        ).toBe(10 * day);
        expect(
            (await MembershipAccessModel.findById(period._id))!.revision,
        ).toBe(0);
    });
    it("counts native active members without relying on their purchase cache", async () => {
        await UserModel.updateOne(
            { _id: member._id },
            { $set: { purchases: [] } },
        );
        expect((await create()).preview.impact.activeMembers).toBe(1);
    });
    it("counts a member with multiple active enrollments once", async () => {
        const native = await AccessMembershipModel.findOne({
            domain: domain._id,
        }).lean();
        const { _id, ...duplicate } = native!;
        await AccessMembershipModel.create({
            ...duplicate,
            membershipId: "second-membership",
            sessionId: "second-session",
            accessActivation: {
                sessionId: "second-session",
                startedAt: new Date(Date.now() - 2 * day),
            },
        });
        const impact = (await create()).preview.impact;
        expect(impact.activeMembers).toBe(1);
        expect(impact.notificationRecipientsNow).toBe(1);
    });
    it("enforces native ownership, tenant and actor permissions", async () => {
        await expect(
            createDripChange(
                { courseId: course.courseId, patch: patch() },
                { ...ctx, user: member },
            ),
        ).rejects.toMatchObject({ code: "not_found" });
        await expect(
            createDripChange(
                { courseId: course.courseId, patch: patch() },
                { ...ctx, memberMimic: {} },
            ),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
            createDripChange(
                { courseId: course.courseId, patch: patch() },
                { ...ctx, subdomain: { _id: member._id } },
            ),
        ).rejects.toMatchObject({ code: "forbidden" });
        await UserModel.updateOne(
            { _id: admin._id },
            { $set: { permissions: ["course:manage"] } },
        );
        ctx.user = await UserModel.findById(admin._id);
        expect(
            (await listDripCourses(ctx)).map((item) => item.courseId),
        ).toEqual([course.courseId]);
        expect((await create()).state.kind).toBe("draft");
    });
    it("applies the exact approved version once and restoration remains a separate draft", async () => {
        const change = await create();
        await expect(
            approveDripChange(change.id, change.version, "0".repeat(64), ctx),
        ).rejects.toMatchObject({ code: "conflict" });
        const applied = await approveDripChange(
            change.id,
            change.version,
            change.previewHash,
            ctx,
        );
        expect(applied.state.kind).toBe("applied");
        const saved = await CourseModel.findById(course._id);
        expect(saved!.groups![0].drip!.delayInMillis).toBe(day);
        expect(saved!.dripChangeReceipt?.outcome).toBe("applied");
        expect(
            (
                await approveDripChange(
                    change.id,
                    change.version,
                    change.previewHash,
                    ctx,
                )
            ).state,
        ).toEqual(applied.state);
        const restoration = await restoreDripChange(
            change.id,
            change.version,
            ctx,
        );
        expect(restoration.state.kind).toBe("draft");
        expect(restoration.patch.rule).toEqual({
            kind: "relative",
            delayInMillis: 10 * day,
        });
        expect(
            (await CourseModel.findById(course._id))!.groups![0].drip!
                .delayInMillis,
        ).toBe(day);
    });
    it("rejects changed native data, changed audience and expired reviews", async () => {
        const change = await create();
        await CourseModel.updateOne({ _id: course._id }, { $inc: { __v: 1 } });
        expect(
            (await approveDripChange(change.id, 1, change.previewHash, ctx))
                .state.kind,
        ).toBe("stale");
        const refreshed = await refreshDripChange(change.id, 1, undefined, ctx);
        await MembershipAccessModel.updateOne(
            { _id: period._id },
            { $inc: { revision: 1 } },
        );
        expect(
            (await approveDripChange(change.id, 2, refreshed.previewHash, ctx))
                .state.kind,
        ).toBe("stale");
        const last = await refreshDripChange(change.id, 2, undefined, ctx);
        jest.spyOn(Date, "now").mockReturnValue(
            new Date(last.preview.expiresAt).getTime() + 1,
        );
        expect(
            (await approveDripChange(change.id, 3, last.previewHash, ctx)).state
                .kind,
        ).toBe("stale");
    });
    it("allows only one approval claimant under double submit", async () => {
        const change = await create();
        const results = await Promise.allSettled([
            approveDripChange(change.id, 1, change.previewHash, ctx),
            approveDripChange(change.id, 1, change.previewHash, ctx),
        ]);
        expect(
            results.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(1);
        expect(((await CourseModel.findById(course._id)) as any).__v).toBe(1);
        expect(
            (await DripChangeModel.findOne({ id: change.id }))!.state.kind,
        ).toBe("applied");
    });
    it("recovers a native write whose response was lost", async () => {
        const change = await create();
        const original = CourseModel.updateOne.bind(CourseModel);
        jest.spyOn(CourseModel, "updateOne").mockImplementationOnce((async (
            ...args: any[]
        ) => {
            await (original as any)(...args);
            throw new Error("response lost");
        }) as any);
        expect(
            (await approveDripChange(change.id, 1, change.previewHash, ctx))
                .state.kind,
        ).toBe("uncertain");
        expect((await reconcileDripChange(change.id, ctx)).state.kind).toBe(
            "applied",
        );
        expect(
            (await DripChangeModel.findOne({ id: change.id }))!.activeCourse,
        ).toBeUndefined();
    });
    it("fences a delayed native write before reporting that it was not applied", async () => {
        const change = await create();
        const original = CourseModel.updateOne.bind(CourseModel);
        let proceed!: () => void, entered!: () => void;
        const barrier = new Promise<void>((resolve) => {
            proceed = resolve;
        });
        const began = new Promise<void>((resolve) => {
            entered = resolve;
        });
        jest.spyOn(CourseModel, "updateOne").mockImplementation((async (
            ...args: any[]
        ) => {
            if (args[1]?.$set?.dripChangeReceipt?.outcome === "applied") {
                entered();
                await barrier;
            }
            return (original as any)(...args);
        }) as any);
        const applying = approveDripChange(
            change.id,
            1,
            change.previewHash,
            ctx,
        );
        await began;
        expect((await reconcileDripChange(change.id, ctx)).state.kind).toBe(
            "not-applied",
        );
        proceed();
        expect((await applying).state.kind).toBe("not-applied");
        expect(
            (await CourseModel.findById(course._id))!.groups![0].drip!
                .delayInMillis,
        ).toBe(10 * day);
    });
    it("prevents a loaded legacy course save from overwriting an approved schedule", async () => {
        const stale = await CourseModel.findById(course._id);
        const change = await create();
        await approveDripChange(change.id, 1, change.previewHash, ctx);
        stale!.groups![0].drip!.delayInMillis = 50 * day;
        await expect(stale!.save()).rejects.toMatchObject({
            name: "VersionError",
        });
        expect(
            (await CourseModel.findById(course._id))!.groups![0].drip!
                .delayInMillis,
        ).toBe(day);
    });
    it("does not relock a recorded release or modify canceled retained grants", async () => {
        await MembershipAccessModel.updateOne(
            { _id: period._id },
            {
                $set: {
                    groupReleases: [
                        {
                            kind: "drip",
                            groupId: "one",
                            at: new Date(Date.now() - day),
                        },
                    ],
                },
            },
        );
        const prepared = await createDripChange(
            {
                courseId: course.courseId,
                patch: {
                    ...patch(),
                    rule: {
                        kind: "exact",
                        at: new Date(Date.now() + 20 * day).toISOString(),
                    },
                },
            },
            ctx,
        );
        expect(prepared.preview.impact.alreadyReleased).toBe(1);
        expect(prepared.preview.impact.samples[0].after).toBe("released");
        await approveDripChange(prepared.id, 1, prepared.previewHash, ctx);
        expect(
            (await MembershipAccessModel.findById(period._id))!.groupReleases,
        ).toHaveLength(1);
    });
    it("blocks availability transitions with current members, but permits them before enrollment", async () => {
        await expect(
            createDripChange(
                {
                    courseId: course.courseId,
                    patch: { ...patch(), rule: { kind: "available" } },
                },
                ctx,
            ),
        ).rejects.toMatchObject({ code: "availability_requires_migration" });
        await CourseModel.updateOne(
            { _id: course._id },
            { $set: { "groups.0.drip.status": false } },
        );
        await expect(create()).rejects.toMatchObject({
            code: "availability_requires_migration",
        });
        expect(
            (await readDripCourse(course.courseId, ctx))
                .availabilityChangesRestricted,
        ).toBe(true);
        await AccessMembershipModel.deleteMany({ domain: domain._id });
        await expect(create()).rejects.toMatchObject({
            code: "availability_requires_migration",
        });
        await CourseModel.updateOne(
            { _id: course._id },
            { $set: { published: false } },
        );
        expect((await create()).state.kind).toBe("draft");
    });
    it("counts held pending messages when a released section is re-enabled", async () => {
        await CourseModel.updateOne(
            { _id: course._id },
            { $set: { "groups.0.drip.email.published": false } },
        );
        await MembershipAccessModel.updateOne(
            { _id: period._id },
            {
                $set: {
                    groupReleases: [
                        { kind: "drip", groupId: "one", at: new Date() },
                    ],
                    deliveries: [
                        {
                            id: "mail",
                            groupId: "one",
                            createdAt: new Date(),
                            state: { kind: "pending" },
                        },
                    ],
                },
            },
        );
        const change = await create();
        expect(change.preview.impact).toMatchObject({
            alreadyReleased: 1,
            pendingMessages: 1,
            notificationRecipientsNow: 1,
            notificationSectionIds: ["one"],
        });
    });
    it("retains unknown anchors and publication dates without inventing enrollment", async () => {
        await AccessMembershipModel.updateOne(
            { domain: domain._id },
            { $unset: { accessActivation: 1 } },
        );
        await MembershipAccessModel.updateOne(
            { _id: period._id },
            { $set: { start: { kind: "legacy-unknown" } } },
        );
        await UserModel.collection.updateOne(
            { _id: member._id },
            { $unset: { "purchases.0.createdAt": 1 } },
        );
        await LessonModel.updateOne(
            { domain: domain._id },
            { $unset: { publication: 1 } },
        );
        const change = await create();
        expect(change.preview.impact.unknownAnchors).toBe(1);
        expect(change.preview.impact.samples[0].after).toBeNull();
        expect(change.preview.after[0].unknownPublicationDates).toBe(1);
    });
    it("requires same-site authenticated REST writes, rejects Mimic and forged fields", async () => {
        await asAdmin();
        const body = { courseId: course.courseId, patch: patch() };
        expect(
            (await POST(request(body, { origin: "https://foreign.example" })))
                .status,
        ).toBe(403);
        expect(
            (
                await POST(
                    request(body, { cookie: "courselit.member-mimic=expired" }),
                )
            ).status,
        ).toBe(403);
        expect(
            (await POST(request({ ...body, approvedBy: member.userId })))
                .status,
        ).toBe(400);
        expect(
            (
                await POST(
                    request({
                        ...body,
                        patch: { ...patch(), groupOrder: ["one", "one"] },
                    }),
                )
            ).status,
        ).toBe(400);
        const submitted = await POST(request(body));
        expect(submitted.status).toBe(201);
        const { change } = await submitted.json();
        const applied = await action(
            request({
                action: "approve",
                version: change.version,
                previewHash: change.previewHash,
            }),
            { params: Promise.resolve({ id: change.id }) },
        );
        expect((await applied.json()).change.state.kind).toBe("applied");
        const read = await GET(
            new NextRequest(
                `https://school.example/api/drip-admin?courseId=${course.courseId}`,
                { headers: { domain: domain.name } },
            ),
        );
        expect(read.status).toBe(200);
        expect(read.headers.get("cache-control")).toBe("no-store");
    });
    it("keeps deletion tenant scoped and leaves unresolved locks for recovery", async () => {
        const change = await create();
        await discardDripChange(change.id, 1, ctx);
        const unsettled = await create();
        await DripChangeModel.updateOne(
            { id: unsettled.id },
            {
                $set: {
                    activeCourse: course.courseId,
                    state: {
                        kind: "uncertain",
                        operationId: "op",
                        approvedBy: admin.userId,
                        at: new Date().toISOString(),
                    },
                },
            },
        );
        await deleteUserDripChanges(String(domain._id), admin.userId);
        expect(await DripChangeModel.exists({ id: change.id })).toBeNull();
        expect(await DripChangeModel.exists({ id: unsettled.id })).toBeTruthy();
        await deleteTenantDripChanges(String(member._id));
        expect(await DripChangeModel.exists({ id: unsettled.id })).toBeTruthy();
        await deleteTenantDripChanges(String(domain._id));
        expect(await DripChangeModel.exists({ id: unsettled.id })).toBeNull();
    });
    it("uses actual previous release anchors and preserves independent exact dates", () => {
        const groups = [
            {
                id: "first",
                rank: 1,
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: day,
                },
            },
            {
                id: "next",
                rank: 2,
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: day,
                },
            },
            {
                id: "dated",
                rank: 3,
                drip: { status: true, type: "exact-date", dateInUTC: 5 * day },
            },
        ];
        expect(
            resolveDripSchedule({
                groups,
                accessibleGroupIds: ["first"],
                anchorAt: 10 * day,
                now: 10 * day,
            }).dueGroupIds,
        ).toEqual(["dated"]);
        expect(
            resolveDripSchedule({
                groups,
                accessibleGroupIds: ["first"],
                anchorAt: 10 * day,
                now: 10 * day,
            }).dates.next,
        ).toBe(11 * day);
        expect(
            resolveDripSchedule({
                groups,
                accessibleGroupIds: [],
                now: 10 * day,
            }).dueGroupIds,
        ).toEqual(["dated"]);
    });
});
