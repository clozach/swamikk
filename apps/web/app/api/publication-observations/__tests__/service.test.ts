import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import CourseModel from "@/models/Course";
import LessonModel from "@/models/Lesson";
import {
    updateCourse,
    updateGroup,
    reorderGroups,
    addGroup,
    removeGroup,
} from "@/graphql/courses/logic";
import {
    observePublications,
    readPublicationCandidates,
} from "@/services/publication-observations/service";
import { classifyObservedRelease } from "../../../../../../packages/common-logic/src/member-access/observations";
import { snapshotRetention } from "../../../../../../packages/common-logic/src/member-access/snapshot";
import { POST, GET } from "../route";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));

describe("verified publication upper bounds", () => {
    let domain: any,
        admin: any,
        member: any,
        course: any,
        lesson: any,
        ctx: any;
    beforeEach(async () => {
        jest.restoreAllMocks();
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(null);
        const suffix = randomUUID();
        domain = await DomainModel.create({
            name: `observation-${suffix}`,
            email: `admin-${suffix}@example.com`,
        });
        admin = await UserModel.create({
            domain: domain._id,
            userId: `admin-${suffix}`,
            email: domain.email,
            active: true,
            permissions: ["course:manage_any"],
        });
        member = await UserModel.create({
            domain: domain._id,
            userId: `member-${suffix}`,
            email: `member-${suffix}@example.com`,
            active: true,
            permissions: [],
        });
        course = await CourseModel.create({
            domain: domain._id,
            courseId: `course-${suffix}`,
            title: "Practice library",
            slug: `practice-${suffix}`,
            creatorId: admin.userId,
            published: true,
            cost: 0,
            costType: "free",
            privacy: "unlisted",
            type: "course",
            releaseRevision: 0,
            groups: [
                {
                    _id: "one",
                    name: "Practice",
                    rank: 1000,
                    drip: { status: false, type: "relative-date" },
                    lessonsOrder: ["old-lesson"],
                },
                {
                    _id: "two",
                    name: "Later",
                    rank: 2000,
                    drip: {
                        status: true,
                        type: "relative-date",
                        delayInMillis: 86400000,
                    },
                    lessonsOrder: [],
                },
            ],
        });
        lesson = await LessonModel.create({
            domain: domain._id,
            lessonId: "old-lesson",
            courseId: course.courseId,
            groupId: "one",
            creatorId: admin.userId,
            title: "Old undated practice",
            type: "text",
            published: true,
            requiresEnrollment: true,
            content: { type: "doc", content: [] },
        });
        ctx = {
            user: admin,
            subdomain: domain,
            address: "https://school.example",
        };
    });
    afterEach(async () => {
        jest.restoreAllMocks();
        for (const model of [CourseModel, LessonModel, UserModel] as any[])
            await model.deleteMany({ domain: domain._id });
        await DomainModel.deleteOne({ _id: domain._id });
    });
    const observe = () =>
        observePublications(
            { courseId: course.courseId, lessonIds: [lesson.lessonId] },
            ctx,
        );
    const read = () => LessonModel.findById(lesson._id).lean() as Promise<any>;
    const observation = async () => (await read()).publicationObservation;
    function period(start: Date, groupReleases: any[] = []) {
        return {
            domainId: String(domain._id),
            userId: member.userId,
            courseId: course.courseId,
            membershipId: "membership",
            membershipSessionId: "session",
            id: "period",
            start: { kind: "recorded", at: start },
            state: { kind: "active" },
            groupReleases,
            revision: 0,
            deliveries: [],
            reopenedOperations: [],
            createdAt: start,
            updatedAt: start,
        } as any;
    }

    it("records a database observation without inventing firstPublishedAt and keeps retries stable", async () => {
        const before = Date.now();
        const result = await observe();
        const current = await read();
        expect(result.results[0].kind).toBe("recorded");
        expect(current.publication).toBeUndefined();
        expect(
            current.publicationObservation.publishedBy.getTime(),
        ).toBeGreaterThanOrEqual(before);
        expect(
            current.publicationObservation.publishedBy.getTime(),
        ).toBeLessThanOrEqual(Date.now());
        expect(current.publicationObservation.witness).toMatchObject({
            groupId: "one",
            releaseRevision: 0,
            availability: "available",
            actorUserId: admin.userId,
        });
        expect((await observe()).results[0].kind).toBe("already-recorded");
        expect((await read()).__v).toBe(current.__v);
        expect((await observation()).publishedBy).toEqual(
            current.publicationObservation.publishedBy,
        );
    });
    it("distinguishes new-member archive from a later real drop after an unrelated lesson addition", async () => {
        await observe();
        const seen = await observation();
        const start = new Date(seen.witness.observedAt.getTime() + 1);
        const cutoff = new Date(start.getTime() + 1000);
        await LessonModel.create({
            domain: domain._id,
            lessonId: "new-drop",
            courseId: course.courseId,
            groupId: "one",
            creatorId: admin.userId,
            title: "New practice",
            type: "text",
            content: { type: "doc", content: [] },
            published: true,
            publication: {
                kind: "known",
                source: "native",
                firstPublishedAt: new Date(start.getTime() + 20),
            },
        });
        const edited = await CourseModel.findById(course._id);
        edited!.groups![0].lessonsOrder.push("new-drop");
        await edited!.save();
        const snapshot = await snapshotRetention(period(start), cutoff);
        expect(snapshot.unknownReleaseCount).toBe(0);
        expect(snapshot.retainedLessonIds).toEqual(["new-drop"]);
        expect(snapshot.visibleLessonIds).toEqual(["new-drop", "old-lesson"]);
    });
    it("keeps an earlier membership unknown without actual release evidence", async () => {
        await observe();
        const seen = await observation();
        const snapshot = await snapshotRetention(
            period(new Date(seen.publishedBy.getTime() - 1000)),
            new Date(seen.publishedBy.getTime() + 1000),
        );
        expect(snapshot.retainedLessonIds).toEqual([]);
        expect(snapshot.unknownReleaseCount).toBe(1);
    });
    it("uses an actual later group release, never observation alone, to prove a retained drop", async () => {
        await observe();
        const seen = await observation();
        const start = new Date(seen.publishedBy.getTime() + 1);
        const releasedAt = new Date(start.getTime() + 20);
        await CourseModel.updateOne(
            { _id: course._id },
            {
                $set: { "groups.0.drip.status": true },
                $inc: { releaseRevision: 1, __v: 1 },
            },
        );
        const snapshot = await snapshotRetention(
            period(start, [{ kind: "drip", groupId: "one", at: releasedAt }]),
            new Date(start.getTime() + 1000),
        );
        expect(snapshot.retainedLessonIds).toEqual(["old-lesson"]);
        expect(snapshot.unknownReleaseCount).toBe(0);
        const unknown = await snapshotRetention(
            period(start, [{ kind: "legacy-unknown", groupId: "one" }]),
            new Date(start.getTime() + 1000),
        );
        expect(unknown.retainedLessonIds).toEqual([]);
        expect(unknown.unknownReleaseCount).toBe(1);
    });
    it.each(["title", "published", "groupId"])(
        "refuses a lesson %s change between reading the course and the lesson CAS",
        async (field) => {
            const original = LessonModel.updateOne.bind(LessonModel);
            jest.spyOn(LessonModel, "updateOne").mockImplementationOnce((async (
                ...args: any[]
            ) => {
                await original(
                    { _id: lesson._id },
                    {
                        $set: {
                            [field]:
                                field === "published"
                                    ? false
                                    : field === "groupId"
                                      ? "two"
                                      : "Changed",
                        },
                        $inc: { __v: 1 },
                    },
                );
                return (original as any)(...args);
            }) as any);
            expect((await observe()).results[0]).toMatchObject({
                kind: "skipped",
                reason: "lesson-changed",
            });
            expect((await read()).publicationObservation).toBeUndefined();
        },
    );
    it.each(["schedule", "unpublish", "remove-group"])(
        "keeps availability unknown when the course %s changes before the lesson CAS",
        async (change) => {
            const original = LessonModel.updateOne.bind(LessonModel);
            jest.spyOn(LessonModel, "updateOne").mockImplementationOnce((async (
                ...args: any[]
            ) => {
                await CourseModel.updateOne(
                    { _id: course._id },
                    {
                        ...(change === "remove-group"
                            ? { $pull: { groups: { _id: "one" } } }
                            : {
                                  $set:
                                      change === "unpublish"
                                          ? { published: false }
                                          : { "groups.0.drip.status": true },
                              }),
                        $inc: { releaseRevision: 1, __v: 1 },
                    },
                );
                return (original as any)(...args);
            }) as any);
            expect((await observe()).results[0].kind).toBe("publication-only");
            const seen = await observation();
            expect(
                classifyObservedRelease({
                    observation: seen,
                    groupId: "one",
                    releaseRevision: 1,
                    availableNow: true,
                    start: new Date(seen.publishedBy.getTime() + 1),
                    cutoff: new Date(seen.publishedBy.getTime() + 1000),
                }),
            ).toBe("unknown");
        },
    );
    it("refuses to observe an unpublished course at the intervening course read", async () => {
        const original = LessonModel.findOne.bind(LessonModel);
        jest.spyOn(LessonModel, "findOne").mockImplementationOnce(((
            ...args: any[]
        ) => ({
            lean: async () => {
                const old = await (original as any)(...args).lean();
                await CourseModel.updateOne(
                    { _id: course._id },
                    {
                        $set: { published: false },
                        $inc: { releaseRevision: 1, __v: 1 },
                    },
                );
                return old;
            },
        })) as any);
        expect((await observe()).results[0]).toMatchObject({
            kind: "skipped",
            reason: "course-unavailable",
        });
        expect((await read()).publicationObservation).toBeUndefined();
    });
    it("reconciles an observation response loss using its persisted operation ID", async () => {
        const original = LessonModel.updateOne.bind(LessonModel);
        jest.spyOn(LessonModel, "updateOne").mockImplementationOnce((async (
            ...args: any[]
        ) => {
            await (original as any)(...args);
            throw new Error("response lost");
        }) as any);
        expect((await observe()).results[0].kind).toBe("recorded");
        expect((await read()).publication).toBeUndefined();
    });
    it("retains the earliest publication upper bound while renewing an obsolete availability witness", async () => {
        await observe();
        const first = await observation();
        await CourseModel.updateOne(
            { _id: course._id },
            { $inc: { releaseRevision: 1, __v: 1 } },
        );
        expect(
            (await readPublicationCandidates(course.courseId, ctx))
                .candidates[0].availabilityWitnessCurrent,
        ).toBe(false);
        await observe();
        const next = await observation();
        expect(next.publishedBy).toEqual(first.publishedBy);
        expect(next.witness.releaseRevision).toBe(1);
        expect(
            classifyObservedRelease({
                observation: next,
                groupId: "one",
                releaseRevision: 1,
                availableNow: true,
                start: first.publishedBy,
                cutoff: new Date(Date.now() + 1000),
            }),
        ).toBe("unknown");
    });
    it("does not overwrite real first publication dates", async () => {
        const known = new Date("2026-01-01T00:00:00Z");
        await LessonModel.updateOne(
            { _id: lesson._id },
            {
                $set: {
                    publication: {
                        kind: "known",
                        firstPublishedAt: known,
                        source: "native",
                    },
                },
            },
        );
        expect((await observe()).results[0]).toMatchObject({
            kind: "skipped",
            reason: "first-publication-recorded",
        });
        expect((await read()).publication.firstPublishedAt).toEqual(known);
        expect((await read()).publicationObservation).toBeUndefined();
    });
    it("invalidates the witness on a native schedule change, but preserves it through inactive settings and display edits", async () => {
        await observe();
        await updateGroup({
            id: "one",
            courseId: course.courseId,
            name: "Renamed",
            collapsed: false,
            drip: { delayInMillis: 2 },
            ctx,
        });
        expect((await CourseModel.findById(course._id))!.releaseRevision).toBe(
            0,
        );
        expect(
            (await readPublicationCandidates(course.courseId, ctx))
                .candidates[0].availabilityWitnessCurrent,
        ).toBe(true);
        await updateGroup({
            id: "one",
            courseId: course.courseId,
            drip: { status: true },
            ctx,
        });
        expect((await CourseModel.findById(course._id))!.releaseRevision).toBe(
            1,
        );
        // Returning to the original rule cannot accidentally revive an old witness.
        await updateGroup({
            id: "one",
            courseId: course.courseId,
            drip: { status: false },
            ctx,
        });
        expect((await CourseModel.findById(course._id))!.releaseRevision).toBe(
            2,
        );
        expect(
            (await readPublicationCandidates(course.courseId, ctx))
                .candidates[0].availabilityWitnessCurrent,
        ).toBe(false);
    });
    it("versions native section order and structure, while identical ordering keeps its revision", async () => {
        await reorderGroups({
            courseId: course.courseId,
            groupIds: ["two", "one"],
            ctx,
        });
        expect((await CourseModel.findById(course._id))!.releaseRevision).toBe(
            1,
        );
        await reorderGroups({
            courseId: course.courseId,
            groupIds: ["two", "one"],
            ctx,
        });
        expect((await CourseModel.findById(course._id))!.releaseRevision).toBe(
            1,
        );
        await addGroup({
            id: course.courseId,
            name: "Third",
            collapsed: true,
            ctx,
        });
        const third = (await CourseModel.findById(course._id))!.groups!.find(
            (item) => item.name === "Third",
        )!;
        expect((await CourseModel.findById(course._id))!.releaseRevision).toBe(
            2,
        );
        await removeGroup(third.id, course.courseId, ctx);
        expect((await CourseModel.findById(course._id))!.releaseRevision).toBe(
            3,
        );
    });
    it("versions a native publication change and refuses to accept a caller-authored revision", async () => {
        ctx.user.name = "Observer";
        ctx.user.permissions.push("course:publish");
        await updateCourse(
            { id: course.courseId, published: false, releaseRevision: 9000 },
            ctx,
        );
        expect((await CourseModel.findById(course._id))!.releaseRevision).toBe(
            1,
        );
        await updateCourse(
            {
                id: course.courseId,
                title: "Renamed library",
                releaseRevision: 9000,
            },
            ctx,
        );
        expect((await CourseModel.findById(course._id))!.releaseRevision).toBe(
            1,
        );
    });
    it("authorizes a bounded same-origin administrator request and rejects fabricated evidence", async () => {
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
            user: { email: admin.email },
        });
        const request = (body: unknown, extra: Record<string, string> = {}) =>
            new NextRequest(
                "https://school.example/api/publication-observations",
                {
                    method: "POST",
                    headers: {
                        domain: domain.name,
                        host: "school.example",
                        origin: "https://school.example",
                        "content-type": "application/json",
                        ...extra,
                    },
                    body: JSON.stringify(body),
                },
            );
        const body = {
            courseId: course.courseId,
            lessonIds: [lesson.lessonId],
        };
        expect(
            (await POST(request({ ...body, publishedBy: "2020-01-01" })))
                .status,
        ).toBe(400);
        expect(
            (await POST(request(body, { origin: "https://elsewhere.example" })))
                .status,
        ).toBe(403);
        expect(
            (
                await POST(
                    request(body, { cookie: "courselit.member-mimic=expired" }),
                )
            ).status,
        ).toBe(403);
        const readResponse = await GET(
            new NextRequest(
                `https://school.example/api/publication-observations?courseId=${course.courseId}`,
                { headers: { domain: domain.name } },
            ),
        );
        expect(readResponse.status).toBe(200);
        expect((await read()).publicationObservation).toBeUndefined();
        expect((await POST(request(body))).status).toBe(200);
        await expect(
            observePublications(body, { ...ctx, user: member }),
        ).rejects.toMatchObject({ code: "not_found" });
        await expect(
            observePublications(body, {
                ...ctx,
                subdomain: { _id: member._id },
            }),
        ).rejects.toMatchObject({ code: "forbidden" });
    });
});
