import mongoose from "mongoose";
import { Constants, type MembershipAccessKey } from "@courselit/common-models";
import {
    AccessCourseModel as Course,
    AccessLessonModel as Lesson,
    AccessMembershipModel as Membership,
    AccessUserModel as User,
    MembershipAccessModel as Access,
} from "../../../../../packages/common-logic/src/member-access/models";
import {
    ensureMembershipAccess,
    prepareRetention,
    endMembership,
    abortRetention,
    getMembershipAccessSummary,
    getLessonAccess,
    getMemberCourseReadScope,
    deleteUserMemberAccess,
    deleteTenantMemberAccess,
} from "@/services/member-access";
import { recordDripRelease } from "../../../../../packages/common-logic/src/member-access/drip";
import {
    memberCourseLibrary,
    projectCourseForMemberAccess,
} from "@/services/member-access/projection";
const start = new Date("2026-02-01"),
    cutoff = new Date("2026-02-10"),
    release = new Date("2026-02-07");
let key: MembershipAccessKey, membership: any, course: any, user: any;
const known = (date: string) => ({
    kind: "known",
    firstPublishedAt: new Date(date),
    source: "native",
});
const op = () => ({ ...key, operationId: "cancel-1", cutoff });
const access = (lessonId: string) =>
    getLessonAccess({ ...key, lessonId, requireMembership: true });
beforeEach(async () => {
    const domainId = new mongoose.Types.ObjectId().toString();
    key = {
        domainId,
        userId: "member",
        courseId: "course",
        membershipId: `membership-${domainId}`,
        membershipSessionId: "session-1",
    };
    user = await User.create({
        domain: domainId,
        userId: key.userId,
        email: "member@example.com",
        active: true,
        purchases: [
            {
                courseId: key.courseId,
                completedLessons: ["archive"],
                accessibleGroups: ["future"],
            },
        ],
    });
    membership = await Membership.create({
        domain: domainId,
        membershipId: key.membershipId,
        sessionId: key.membershipSessionId,
        userId: key.userId,
        entityId: key.courseId,
        entityType: Constants.MembershipEntityType.COURSE,
        paymentPlanId: "plan",
        status: Constants.MembershipStatus.ACTIVE,
        accessActivation: {
            sessionId: key.membershipSessionId,
            startedAt: start,
        },
    });
    course = await Course.create({
        domain: domainId,
        courseId: key.courseId,
        title: "Course",
        slug: `course-${domainId}`,
        cost: 0,
        costType: "free",
        privacy: "public",
        type: "course",
        creatorId: "author",
        published: true,
        groups: [
            {
                _id: "open",
                name: "Open",
                rank: 0,
                drip: { status: false, type: "relative-date" },
                lessonsOrder: ["archive", "drop", "unknown", "draft"],
            },
            {
                _id: "released",
                name: "Released",
                rank: 1,
                drip: { status: true, type: "exact-date", dateInUTC: release },
                lessonsOrder: ["drip"],
            },
            {
                _id: "future",
                name: "Future",
                rank: 2,
                drip: {
                    status: true,
                    type: "exact-date",
                    dateInUTC: new Date("2027-01-01"),
                },
                lessonsOrder: ["future"],
            },
        ],
    });
    await Lesson.insertMany(
        [
            {
                lessonId: "archive",
                publication: known("2026-01-01"),
                groupId: "open",
            },
            {
                lessonId: "drop",
                publication: known("2026-02-05"),
                groupId: "open",
            },
            { lessonId: "unknown", groupId: "open" },
            {
                lessonId: "draft",
                publication: { kind: "never" },
                groupId: "open",
                published: false,
            },
            {
                lessonId: "drip",
                publication: known("2026-01-01"),
                groupId: "released",
            },
            {
                lessonId: "future",
                publication: known("2026-01-01"),
                groupId: "future",
            },
        ].map((item) => ({
            domain: domainId,
            courseId: key.courseId,
            title: item.lessonId,
            type: "text",
            creatorId: "author",
            published: true,
            requiresEnrollment: true,
            ...item,
        })),
    );
    // Fixture context already existed before its February cancellation cutoff.
    await Course.updateMany(
        { domain: domainId },
        { $set: { updatedAt: new Date("2026-01-01") } },
        { timestamps: false },
    );
    for (const lesson of await Lesson.find({ domain: domainId }))
        await Lesson.updateOne(
            { _id: lesson._id },
            {
                $set: {
                    updatedAt:
                        lesson.publication?.kind === "known"
                            ? lesson.publication.firstPublishedAt
                            : new Date("2026-01-01"),
                },
            },
            { timestamps: false },
        );
});
afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all(
        [Course, Lesson, Membership, User, Access].map((model) =>
            (model as any).deleteMany({}),
        ),
    );
});
it("uses actual active membership, ignores stale purchase groups, and never writes on reads", async () => {
    expect(await access("archive")).toEqual({
        kind: "allowed",
        source: "active",
    });
    expect(await access("future")).toEqual({
        kind: "denied",
        reason: "not-released",
    });
    expect(await Access.countDocuments()).toBe(0);
    await Membership.updateOne(
        { _id: membership._id },
        { status: Constants.MembershipStatus.EXPIRED },
    );
    expect(await access("archive")).toEqual({
        kind: "denied",
        reason: "membership-required",
    });
});
it("records persisted activation exactly once and rejects invented retry start", async () => {
    const [a, b] = await Promise.all([
        ensureMembershipAccess({ domainId: key.domainId, membership }),
        ensureMembershipAccess({ domainId: key.domainId, membership }),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.start).toEqual({ kind: "recorded", at: start });
    expect(a.groupReleases).toEqual([]);
    expect(await Access.countDocuments()).toBe(1);
    await Access.deleteMany({});
    await expect(
        ensureMembershipAccess({
            domainId: key.domainId,
            membership,
            startedAt: cutoff,
        }),
    ).rejects.toThrow("recorded membership start");
});
it("freezes exact IDs, caps pending cancellation, and retains only dated released drops", async () => {
    await ensureMembershipAccess({ domainId: key.domainId, membership });
    expect(
        await recordDripRelease(key, ["released"], [], ["released"], release),
    ).toMatchObject({
        groupReleases: [{ kind: "drip", groupId: "released", at: release }],
    });
    const prepared = await prepareRetention(op());
    expect(prepared.snapshot).toEqual({
        cutoff,
        visibleLessonIds: ["archive", "drip", "drop", "unknown"],
        retainedLessonIds: ["drip", "drop"],
        unknownReleaseCount: 1,
    });
    expect(await prepareRetention(op())).toEqual(prepared);
    expect(await access("archive")).toEqual({
        kind: "allowed",
        source: "prepared",
    });
    expect(
        await recordDripRelease(key, ["future"], [], [], new Date()),
    ).toBeNull();
    await Lesson.create({
        domain: key.domainId,
        courseId: key.courseId,
        lessonId: "late",
        title: "Late",
        type: "text",
        creatorId: "author",
        groupId: "released",
        published: true,
        publication: known("2026-01-01"),
        requiresEnrollment: true,
    });
    expect((await access("late")).kind).toBe("denied");
    const ended = await endMembership(op());
    expect(ended.kind).toBe("ended");
    expect(await endMembership(op())).toEqual(ended);
    expect((await access("archive")).kind).toBe("denied");
    expect(await access("drop")).toEqual({
        kind: "allowed",
        source: "retained",
    });
    expect(await access("drip")).toEqual({
        kind: "allowed",
        source: "retained",
    });
    await Course.updateOne(
        { _id: course._id },
        {
            $set: {
                "groups.1.drip.status": false,
                "groups.2.drip.status": false,
            },
        },
    );
    expect((await access("late")).kind).toBe("denied");
    expect((await access("future")).kind).toBe("denied");
    expect(await getMembershipAccessSummary(key)).toMatchObject({
        start: { kind: "recorded", at: start },
        state: "ended",
        cutoff,
        retainedCount: 2,
        unknownReleaseCount: 1,
    });
});
it("keeps an earned drip release date after the author switches the schedule off", async () => {
    await ensureMembershipAccess({ domainId: key.domainId, membership });
    await recordDripRelease(key, ["released"], [], [], release);
    await Course.updateOne(
        { _id: course._id },
        {
            $set: {
                "groups.1.drip.status": false,
                updatedAt: new Date("2026-02-08"),
            },
        },
        { timestamps: false },
    );
    expect((await prepareRetention(op())).snapshot.retainedLessonIds).toEqual([
        "drip",
        "drop",
    ]);
});
it("rejects stale operations and reopens only proven active unfinalized cancellation", async () => {
    await prepareRetention(op());
    await expect(
        prepareRetention({ ...op(), operationId: "other" }),
    ).rejects.toThrow("Another cancellation");
    await expect(prepareRetention({ ...op(), cutoff: start })).rejects.toThrow(
        "original cancellation cutoff",
    );
    await expect(
        abortRetention({
            ...op(),
            providerStillActive: false,
            evidenceId: "receipt",
        } as any),
    ).rejects.toThrow("evidence");
    expect((await getMemberCourseReadScope(key)).kind).toBe("restricted");
    const reopened = await abortRetention({
        ...op(),
        providerStillActive: true,
        evidenceId: "provider-read-1",
    });
    expect(reopened.state.kind).toBe("active");
    expect(
        (
            await abortRetention({
                ...op(),
                providerStillActive: true,
                evidenceId: "provider-read-1",
            })
        ).id,
    ).toBe(reopened.id);
    await expect(prepareRetention(op())).rejects.toThrow("already aborted");
    await prepareRetention({ ...op(), operationId: "new-cancel" });
    await endMembership({ ...op(), operationId: "new-cancel" });
    await expect(
        abortRetention({
            ...op(),
            operationId: "new-cancel",
            providerStillActive: true,
            evidenceId: "receipt",
        }),
    ).rejects.toThrow("unfinalized");
});
it("fails closed on interrupted freeze and resumes the exact operation", async () => {
    await ensureMembershipAccess({ domainId: key.domainId, membership });
    const spy = jest.spyOn(Lesson, "find").mockImplementationOnce(() => {
        throw new Error("database interrupted");
    });
    await expect(prepareRetention(op())).rejects.toThrow(
        "database interrupted",
    );
    spy.mockRestore();
    expect(await getMemberCourseReadScope(key)).toMatchObject({
        kind: "restricted",
        lessonIds: [],
        processing: true,
    });
    expect((await prepareRetention(op())).kind).toBe("prepared");
});
it("preserves retained IDs across rejoin without inheriting old group access", async () => {
    await ensureMembershipAccess({ domainId: key.domainId, membership });
    await recordDripRelease(key, ["released"], [], [], release);
    await prepareRetention(op());
    await endMembership(op());
    await Membership.updateOne(
        { _id: membership._id },
        {
            sessionId: "session-2",
            accessActivation: {
                sessionId: "session-2",
                startedAt: new Date("2026-03-01"),
            },
        },
    );
    const rejoined = await Membership.findById(membership._id);
    expect(
        (
            await ensureMembershipAccess({
                domainId: key.domainId,
                membership: rejoined!,
            })
        ).groupReleases,
    ).toEqual([]);
    expect(await access("archive")).toEqual({
        kind: "allowed",
        source: "active",
    });
    expect(await access("drip")).toEqual({
        kind: "allowed",
        source: "retained",
    });
    await prepareRetention({
        ...key,
        membershipSessionId: "session-2",
        operationId: "cancel-2",
        cutoff: new Date("2026-03-05"),
    });
    await endMembership({
        ...key,
        membershipSessionId: "session-2",
        operationId: "cancel-2",
    });
    expect(await access("drop")).toEqual({
        kind: "allowed",
        source: "retained",
    });
    expect((await access("archive")).kind).toBe("denied");
});
it("marks legacy dates unknown instead of inventing new drops", async () => {
    await Membership.updateOne(
        { _id: membership._id },
        { $unset: { accessActivation: 1 } },
    );
    const legacy = await ensureMembershipAccess({
        domainId: key.domainId,
        membership,
    });
    expect(legacy.start).toEqual({ kind: "legacy-unknown" });
    expect(legacy.groupReleases).toEqual([
        { kind: "legacy-unknown", groupId: "future" },
    ]);
    const result = await prepareRetention(op());
    expect(result.snapshot.retainedLessonIds).toEqual([]);
    expect(result.snapshot.unknownReleaseCount).toBe(4);
});
it("projects exact retained navigation/library and omits private Mimic activity", async () => {
    await prepareRetention(op());
    await endMembership(op());
    const ctx = {
        subdomain: { _id: key.domainId },
        user,
        memberMimic: { subjectUserId: key.userId },
    } as any;
    expect(
        (
            await projectCourseForMemberAccess(course.toObject(), ctx)
        ).groups?.flatMap((group: any) => group.lessonsOrder),
    ).toEqual(["drop"]);
    expect(await memberCourseLibrary(ctx, user)).toMatchObject([
        {
            entity: {
                id: key.courseId,
                totalLessons: 1,
                completedLessonsCount: null,
                certificateId: null,
            },
        },
    ]);
    expect(
        await memberCourseLibrary(
            { ...ctx, user: { userId: "other" } },
            { userId: "other" },
        ),
    ).toEqual([]);
});
it("isolates tenant/member cleanup and rejects cross-tenant operation keys", async () => {
    await ensureMembershipAccess({ domainId: key.domainId, membership });
    const otherDomain = new mongoose.Types.ObjectId().toString();
    await expect(
        prepareRetention({ ...op(), domainId: otherDomain }),
    ).rejects.toThrow("unavailable");
    await deleteUserMemberAccess(otherDomain, key.userId);
    await deleteUserMemberAccess(key.domainId, "other");
    await deleteTenantMemberAccess(otherDomain);
    expect(await Access.countDocuments()).toBe(1);
    await deleteUserMemberAccess(key.domainId, key.userId);
    expect(await Access.countDocuments()).toBe(0);
});

it("previews without creating access or freezing, then uses the confirmed snapshot", async () => {
    const { previewRetention } = await import("@/services/member-access");
    expect(await previewRetention(key, cutoff)).toEqual({
        kind: "unknown",
        reason: "unrecorded-period",
    });
    expect(await Access.countDocuments()).toBe(0);
    await ensureMembershipAccess({ domainId: key.domainId, membership });
    const before = await Access.findOne().lean();
    const preview = await previewRetention(key, cutoff);
    expect(preview).toMatchObject({
        kind: "preview",
        snapshot: { retainedLessonIds: ["drop"] },
    });
    expect(await Access.findOne().lean()).toEqual(before);
    await prepareRetention(op());
    await endMembership(op());
    expect(await previewRetention(key, new Date())).toEqual(preview);
});

it("starts with the first retained lesson when a rejoin has no newly released groups", async () => {
    await ensureMembershipAccess({ domainId: key.domainId, membership });
    await recordDripRelease(key, ["released"], [], [], release);
    await prepareRetention(op());
    await endMembership(op());
    await Membership.updateOne(
        { _id: membership._id },
        {
            sessionId: "session-2",
            accessActivation: {
                sessionId: "session-2",
                startedAt: new Date("2026-03-01"),
            },
        },
    );
    await Course.updateOne(
        { _id: course._id },
        { $set: { "groups.0.drip.status": true } },
    );
    const current = await Course.findById(course._id).lean();
    const projected = await projectCourseForMemberAccess(
        { ...current!, firstLesson: "" },
        { subdomain: { _id: key.domainId }, user } as any,
    );
    expect(projected.firstLesson).toBe("drop");
    const { projectMemberPurchases } = await import(
        "@/services/member-access/projection"
    );
    expect(await projectMemberPurchases(key.domainId, user)).toMatchObject([
        {
            accessibleGroups: [],
            retainedLessonIds: expect.arrayContaining(["drip", "drop"]),
        },
    ]);
});
