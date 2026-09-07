import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import LessonModel from "@/models/Lesson";
import CourseModel from "@/models/Course";
import {
    ContentChangeModel,
    FeedbackModel,
    FeedbackRateLimitModel,
} from "@/services/content-changes/models";
import {
    createChange,
    getChange,
    prepareRevert,
    reviseChange,
} from "@/services/content-changes/proposals";
import {
    approveChange,
    reconcileChange,
} from "@/services/content-changes/application";
import {
    createFeedback,
    feedbackDetail,
    listFeedback,
} from "@/services/content-changes/feedback";
import { deleteChange } from "@/services/content-changes/cleanup";
import { consumeRateLimit } from "@/services/content-changes/rate-limit";
import { nextCursor } from "@/services/content-changes/pagination";
import { getMedia } from "@/services/medialit";
import * as lessonLogic from "@/graphql/lessons/logic";
import { POST as submitFeedback } from "../../feedback/route";
import { POST as submitProposal } from "../route";
import { GET as getFeedbackPhoto } from "../../feedback/[id]/photos/[mediaId]/route";
import { auth } from "@/auth";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    deleteMedia: jest.fn(),
    sealMedia: jest.fn(),
    getMedia: jest.fn(),
}));

const doc = (text: string) => ({
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("Persisted feedback and approved lesson changes", () => {
    let domain: any,
        otherDomain: any,
        admin: any,
        member: any,
        lesson: any,
        ctx: any,
        memberCtx: any;

    beforeAll(async () => {
        await Promise.all([
            ContentChangeModel.init(),
            FeedbackModel.init(),
            FeedbackRateLimitModel.init(),
        ]);
    });
    beforeEach(async () => {
        jest.restoreAllMocks();
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(null);
        const suffix = randomUUID();
        domain = await DomainModel.create({
            name: `changes-${suffix}`,
            email: `owner-${suffix}@example.com`,
        });
        otherDomain = await DomainModel.create({
            name: `other-${suffix}`,
            email: `other-${suffix}@example.com`,
        });
        admin = await UserModel.create({
            domain: domain._id,
            userId: `admin-${suffix}`,
            email: domain.email,
            active: true,
            permissions: ["course:manage_any", "site:manage"],
            unsubscribeToken: `admin-unsub-${suffix}`,
        });
        member = await UserModel.create({
            domain: domain._id,
            userId: `member-${suffix}`,
            email: `member-${suffix}@example.com`,
            active: true,
            permissions: [],
            unsubscribeToken: `member-unsub-${suffix}`,
        });
        const course = await CourseModel.create({
            domain: domain._id,
            courseId: `course-${suffix}`,
            title: "Practice",
            creatorId: admin.userId,
            type: "course",
            privacy: "public",
            costType: "free",
            cost: 0,
            slug: `practice-${suffix}`,
            published: true,
            groups: [
                {
                    _id: "intro",
                    name: "Introduction",
                    rank: 1,
                    lessonsOrder: [],
                    drip: { status: false, type: "relative-date" },
                },
            ],
        });
        lesson = await LessonModel.create({
            domain: domain._id,
            lessonId: `lesson-${suffix}`,
            courseId: course.courseId,
            groupId: "intro",
            title: "Original",
            content: doc("Original text"),
            type: "text",
            creatorId: admin.userId,
            published: true,
            requiresEnrollment: false,
        });
        ctx = {
            subdomain: domain,
            user: admin,
            address: "https://school.example",
        };
        memberCtx = { ...ctx, user: member };
    });
    afterEach(async () => {
        jest.restoreAllMocks();
        for (const model of [
            ContentChangeModel,
            FeedbackModel,
            LessonModel,
            CourseModel,
            UserModel,
        ] as any[])
            await model.deleteMany({
                domain: { $in: [domain._id, otherDomain._id] },
            });
        await DomainModel.deleteMany({
            _id: { $in: [domain._id, otherDomain._id] },
        });
    });
    const input = () => ({
        target: { kind: "lesson" as const, lessonId: lesson.lessonId },
        patch: { title: "Reviewed title", content: doc("Reviewed text") },
        summary: "Clarify the introduction.",
    });
    const pageFeedback = () => ({
        text: "Please explain this.",
        target: { kind: "page" as const, path: "/", componentId: "welcome" },
    });

    it("keeps visitor/member input private and rejects forged identities and foreign targets", async () => {
        const visitor = await createFeedback(pageFeedback(), {
            ...ctx,
            user: undefined,
        });
        expect(visitor.actor).toEqual({ kind: "visitor" });
        const mine = await createFeedback(pageFeedback(), memberCtx);
        expect(mine.actor).toEqual({ kind: "member", userId: member.userId });
        expect((await listFeedback(memberCtx)).map((item) => item.id)).toEqual([
            mine.id,
        ]);
        expect(
            (await feedbackDetail(mine.id, memberCtx)).prompt,
        ).toBeUndefined();
        expect((await feedbackDetail(mine.id, ctx)).prompt).toContain(
            "Untrusted feedback",
        );
        await expect(
            feedbackDetail(visitor.id, memberCtx),
        ).rejects.toMatchObject({ code: "not_found" });
        await expect(
            createFeedback(
                { ...pageFeedback(), actor: { kind: "admin" } } as any,
                memberCtx,
            ),
        ).rejects.toThrow();
        await expect(
            createFeedback(
                {
                    text: "secret",
                    target: {
                        kind: "lesson",
                        lessonId: lesson.lessonId,
                        field: "title",
                    },
                },
                { ...ctx, subdomain: otherDomain },
            ),
        ).rejects.toMatchObject({ code: "forbidden" });
    });

    it("accepts photo references only from admins and the same site's image library", async () => {
        await expect(
            createFeedback(
                { ...pageFeedback(), photoMediaIds: ["photo"] },
                memberCtx,
            ),
        ).rejects.toMatchObject({ code: "forbidden" });
        (getMedia as jest.Mock).mockResolvedValue({
            group: otherDomain.name,
            mimeType: "image/png",
        });
        await expect(
            createFeedback(
                { ...pageFeedback(), photoMediaIds: ["photo"] },
                ctx,
            ),
        ).rejects.toMatchObject({ code: "not_found" });
        (getMedia as jest.Mock).mockResolvedValue({
            group: domain.name,
            mimeType: "image/png",
        });
        expect(
            (
                await createFeedback(
                    { ...pageFeedback(), photoMediaIds: ["photo"] },
                    ctx,
                )
            ).photoMediaIds,
        ).toEqual(["photo"]);
    });

    it("persists drafts without changing content, and rejects stale approval versions", async () => {
        const proposed = await createChange(input(), ctx);
        expect(
            (await LessonModel.findOne({ lessonId: lesson.lessonId })).title,
        ).toBe("Original");
        const revised = await reviseChange(
            proposed.id,
            1,
            { title: "Second preview" },
            "Use the revised wording.",
            ctx,
        );
        expect(revised.history[0].previewHash).toBe(proposed.previewHash);
        await expect(
            approveChange(proposed.id, 1, proposed.previewHash, ctx),
        ).rejects.toMatchObject({ code: "conflict" });
        const result = await approveChange(
            revised.id,
            2,
            revised.previewHash,
            ctx,
        );
        expect(result.state.kind).toBe("applied");
        expect(result.approvals).toHaveLength(1);
        expect(
            (await LessonModel.findOne({ lessonId: lesson.lessonId })).title,
        ).toBe("Second preview");
    });

    it("denies members, foreign tenants, and wrong preview hashes", async () => {
        await expect(createChange(input(), memberCtx)).rejects.toMatchObject({
            code: "not_found",
        });
        const proposed = await createChange(input(), ctx);
        await expect(
            approveChange(proposed.id, 1, proposed.previewHash, memberCtx),
        ).rejects.toMatchObject({ code: "not_found" });
        await expect(
            getChange(proposed.id, { ...ctx, subdomain: otherDomain }),
        ).rejects.toMatchObject({ code: "not_found" });
        await expect(
            approveChange(proposed.id, 1, "0".repeat(64), ctx),
        ).rejects.toMatchObject({ code: "conflict" });
    });

    it("claims duplicate approvals once and applies one native write", async () => {
        const proposed = await createChange(input(), ctx);
        await Promise.all([
            approveChange(proposed.id, 1, proposed.previewHash, ctx),
            approveChange(proposed.id, 1, proposed.previewHash, ctx),
        ]);
        const result = await reconcileChange(proposed.id, ctx);
        expect(result.state.kind).toBe("applied");
        expect(result.approvals).toHaveLength(1);
        const live = await LessonModel.findOne({ lessonId: lesson.lessonId });
        expect(live.__v).toBe(1);
        expect(live.content).toEqual(proposed.preview.after.content);
        await approveChange(proposed.id, 1, proposed.previewHash, ctx);
        expect(
            (await LessonModel.findOne({ lessonId: lesson.lessonId })).__v,
        ).toBe(1);
    });

    it("detects native and unversioned maintenance edits before approving", async () => {
        const proposed = await createChange(input(), ctx);
        await LessonModel.updateOne(
            { lessonId: lesson.lessonId },
            { title: "Other editor" },
        );
        const result = await approveChange(
            proposed.id,
            1,
            proposed.previewHash,
            ctx,
        );
        expect(result.state.kind).toBe("stale");
        expect(
            (await LessonModel.findOne({ lessonId: lesson.lessonId })).title,
        ).toBe("Other editor");
    });

    it("reconciles a committed edit even when the native response is lost", async () => {
        const proposed = await createChange(input(), ctx);
        const original = lessonLogic.updateLesson;
        jest.spyOn(lessonLogic, "updateLesson").mockImplementationOnce(
            async (...args) => {
                await original(...args);
                throw new Error("response lost");
            },
        );
        expect(
            (await approveChange(proposed.id, 1, proposed.previewHash, ctx))
                .state.kind,
        ).toBe("applied");
        expect(
            (await LessonModel.findOne({ lessonId: lesson.lessonId })).__v,
        ).toBe(1);
    });

    it("fences an interrupted uncommitted write so a delayed attempt cannot land", async () => {
        const proposed = await createChange(input(), ctx);
        const operationId = randomUUID();
        const approval = {
            userId: admin.userId,
            at: new Date().toISOString(),
            version: 1,
            previewHash: proposed.previewHash,
        };
        await ContentChangeModel.updateOne(
            { id: proposed.id },
            {
                $set: {
                    state: { kind: "applying", operationId, approval },
                    activeTarget: `lesson:${lesson.lessonId}`,
                },
            },
        );
        expect((await reconcileChange(proposed.id, ctx)).state.kind).toBe(
            "failed",
        );
        await expect(
            lessonLogic.updateLesson(
                { id: lesson.lessonId, title: "Delayed content" } as any,
                ctx,
                {
                    revision: proposed.baseline.revision,
                    fingerprint: proposed.baseline.fingerprint,
                    operationId,
                },
            ),
        ).rejects.toMatchObject({ code: "stale" });
        expect(
            (await LessonModel.findOne({ lessonId: lesson.lessonId })).title,
        ).toBe("Original");
        expect(
            (await ContentChangeModel.findOne({ id: proposed.id }))
                ?.activeTarget,
        ).toBeUndefined();
    });

    it("holds one unsettled change per lesson, then permits a fresh proposal after fencing", async () => {
        const first = await createChange(input(), ctx);
        const second = await createChange(
            { ...input(), patch: { title: "Another proposal" } },
            ctx,
        );
        await ContentChangeModel.updateOne(
            { id: first.id },
            {
                $set: {
                    state: {
                        kind: "uncertain",
                        operationId: randomUUID(),
                        approval: {
                            userId: admin.userId,
                            at: new Date().toISOString(),
                            version: 1,
                            previewHash: first.previewHash,
                        },
                        reason: "Interrupted",
                    },
                    activeTarget: `lesson:${lesson.lessonId}`,
                },
            },
        );
        await expect(
            approveChange(second.id, 1, second.previewHash, ctx),
        ).rejects.toMatchObject({ code: "target_busy" });
        await expect(deleteChange(first.id, ctx)).rejects.toMatchObject({
            code: "conflict",
        });
        await reconcileChange(first.id, ctx);
        const fresh = await reviseChange(
            second.id,
            1,
            { title: "After recovery" },
            "Retry with a fresh baseline.",
            ctx,
        );
        expect(
            (await approveChange(fresh.id, 2, fresh.previewHash, ctx)).state
                .kind,
        ).toBe("applied");
    });

    it("prepares recovery separately and protects subsequent edits", async () => {
        const proposed = await createChange(input(), ctx);
        await approveChange(proposed.id, 1, proposed.previewHash, ctx);
        const reverse = await prepareRevert(proposed.id, 1, ctx);
        expect(reverse.reversesChangeId).toBe(proposed.id);
        expect(
            (await LessonModel.findOne({ lessonId: lesson.lessonId })).title,
        ).toBe("Reviewed title");
        await approveChange(reverse.id, 1, reverse.previewHash, ctx);
        expect(
            (await LessonModel.findOne({ lessonId: lesson.lessonId })).title,
        ).toBe("Original");
        await expect(prepareRevert(proposed.id, 1, ctx)).rejects.toMatchObject({
            code: "stale",
        });
        await expect(deleteChange(proposed.id, ctx)).rejects.toMatchObject({
            code: "conflict",
        });
    });

    it("rejects active HTML/unsafe links and new embedded assets in text proposals", async () => {
        for (const node of [
            { type: "html", content: "<script>alert(1)</script>" },
            { type: "image", attrs: { src: "https://other.example/image" } },
            {
                type: "paragraph",
                content: [
                    {
                        type: "text",
                        text: "click",
                        marks: [
                            {
                                type: "link",
                                attrs: { href: "javascript:alert(1)" },
                            },
                        ],
                    },
                ],
            },
        ]) {
            await expect(
                createChange(
                    {
                        ...input(),
                        patch: { content: { type: "doc", content: [node] } },
                    },
                    ctx,
                ),
            ).rejects.toThrow();
        }
    });

    it("enforces rate limits atomically under concurrent submissions", async () => {
        const results = await Promise.allSettled(
            Array.from({ length: 20 }, () =>
                consumeRateLimit(randomUUIDPrefix, 6, 60_000),
            ),
        );
        expect(
            results.filter((item) => item.status === "fulfilled"),
        ).toHaveLength(6);
        expect(
            results.filter((item) => item.status === "rejected"),
        ).toHaveLength(14);
    });
    const randomUUIDPrefix = randomUUID();

    it("enforces same-origin writes and bounds actual request bytes", async () => {
        const request = (body: unknown, origin = "https://school.example") =>
            new NextRequest("https://school.example/api/feedback", {
                method: "POST",
                headers: {
                    domain: domain.name,
                    origin,
                    "content-type": "application/json",
                },
                body: JSON.stringify(body),
            });
        expect(
            (
                await submitFeedback(
                    request(pageFeedback(), "https://attacker.example"),
                )
            ).status,
        ).toBe(403);
        expect(
            (
                await submitFeedback(
                    request({ ...pageFeedback(), text: "x".repeat(21_000) }),
                )
            ).status,
        ).toBe(413);
        const response = await submitFeedback(request(pageFeedback()));
        expect(response.status).toBe(201);
        expect((await response.json()).feedback.actor.kind).toBe("visitor");
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
            user: { email: admin.email },
        });
        expect(
            (await submitProposal(request(input(), "https://attacker.example")))
                .status,
        ).toBe(403);
    });

    it("delivers attached photos only to a current site administrator", async () => {
        const photoId = "private-photo";
        const record = await FeedbackModel.create({
            domain: domain._id,
            id: randomUUID(),
            text: "Screenshot",
            target: { kind: "page", path: "/", componentId: "page" },
            actor: { kind: "admin", userId: admin.userId },
            photoMediaIds: [photoId],
            state: "open",
        });
        const request = new NextRequest(
            "https://school.example/api/feedback/photo",
            { headers: { domain: domain.name } },
        );
        const route = {
            params: Promise.resolve({ id: record.id, mediaId: photoId }),
        };
        expect((await getFeedbackPhoto(request, route)).status).toBe(403);
        jest.mocked(auth.api.getSession).mockResolvedValue({
            user: { email: member.email },
        } as any);
        expect((await getFeedbackPhoto(request, route)).status).toBe(403);
        jest.mocked(auth.api.getSession).mockResolvedValue({
            user: { email: admin.email },
        } as any);
        jest.mocked(getMedia).mockResolvedValue({
            group: otherDomain.name,
            file: "https://media.example/image.png",
            mimeType: "image/png",
        } as any);
        expect((await getFeedbackPhoto(request, route)).status).toBe(404);
        jest.mocked(getMedia).mockResolvedValue({
            group: domain.name,
            file: "https://media.example/image.png",
            mimeType: "image/png",
        } as any);
        const fetchPhoto = jest
            .spyOn(global, "fetch")
            .mockResolvedValue(new Response("image-bytes"));
        const result = await getFeedbackPhoto(request, route);
        expect(result.status).toBe(200);
        expect(result.headers.get("Cache-Control")).toBe("private, no-store");
        expect(await result.text()).toBe("image-bytes");
        expect(
            (
                await getFeedbackPhoto(request, {
                    params: Promise.resolve({
                        id: record.id,
                        mediaId: "not-attached",
                    }),
                })
            ).status,
        ).toBe(404);
        expect(fetchPhoto).toHaveBeenCalledTimes(1);
    });

    it("paginates equal-timestamp comments without silently losing older feedback", async () => {
        const createdAt = new Date("2026-09-06T00:00:00Z");
        await FeedbackModel.insertMany(
            Array.from({ length: 51 }, (_, index) => ({
                domain: domain._id,
                id: `page-${String(index).padStart(2, "0")}`,
                text: "Review item",
                actor: { kind: "member", userId: member.userId },
                target: { kind: "page", path: "/", componentId: "page" },
                state: "open",
                createdAt,
            })),
        );
        const first = await listFeedback(ctx);
        const second = await listFeedback(ctx, nextCursor(first)!);
        expect(first).toHaveLength(50);
        expect(second).toHaveLength(1);
        expect(new Set([...first, ...second].map((item) => item.id)).size).toBe(
            51,
        );
        await expect(listFeedback(ctx, "invalid-cursor")).rejects.toThrow(
            "Invalid page cursor",
        );
    });
});
