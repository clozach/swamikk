import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import UserModel from "@/models/User";
import PageModel from "@/models/Page";
import CourseModel from "@/models/Course";
import LessonModel from "@/models/Lesson";
import {
    FeedbackModel,
    ContentChangeModel,
} from "@/services/content-changes/models";
import * as persistence from "@/services/content-changes/reviewer-proposal";
import * as preparation from "@/services/feedback-review/prepare";
import { claimReview } from "@/services/feedback-review/claim";
import { REVIEW_LEASE_MS } from "@/services/feedback-review/leases";
import {
    feedbackView,
    setFeedbackState,
} from "@/services/content-changes/feedback";
import { issueGrant, revokeGrant } from "@/services/feedback-review/grants";
import { withReviewer } from "@/services/feedback-review/authority";
import { approveChange } from "@/services/content-changes/application";
import {
    beginAccountClosure,
    requireAccountErasureReady,
} from "../../../../../../packages/common-logic/src/account-lifecycle/gate";
import { POST as resultRoute } from "../result/route";
import { POST as contextRoute } from "../context/route";
import { fixture, doc, proposal, escalation } from "./fixtures";
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
    deleteMedia: jest.fn(),
}));
let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
    jest.restoreAllMocks();
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValue(null);
    f = await fixture();
});
const request = (path: string, body: unknown) =>
    new NextRequest(`https://site.example${path}`, {
        method: "POST",
        headers: {
            domain: f.domain.name,
            "content-type": "application/json",
            authorization: `Bearer ${f.token}`,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
async function lessonFeedback(requiresEnrollment = false, drip = false) {
    const id = randomUUID();
    const course = await CourseModel.create({
        domain: f.domain._id,
        courseId: id,
        title: "Course",
        creatorId: f.user.userId,
        type: "course",
        privacy: "public",
        costType: "free",
        cost: 0,
        slug: id,
        published: true,
        groups: [
            {
                _id: "intro",
                name: "Intro",
                rank: 1,
                lessonsOrder: [],
                drip: { status: drip, type: "relative-date" },
            },
        ],
    });
    const lesson = await LessonModel.create({
        domain: f.domain._id,
        lessonId: id,
        courseId: course.courseId,
        groupId: "intro",
        title: "Public lesson",
        content: doc("Public lesson words"),
        type: "text",
        creatorId: f.user.userId,
        published: true,
        requiresEnrollment,
    });
    await FeedbackModel.updateOne(
        { _id: f.feedback._id },
        {
            $set: {
                target: { kind: "lesson", lessonId: id, field: "content" },
            },
        },
    );
    return { course, lesson };
}
test("claim/context omit identity, photos, drafts and full widget data; input is expressly untrusted", async () => {
    await PageModel.updateOne(
        { _id: f.page._id },
        {
            $set: {
                draftTitle: "PRIVATE DRAFT",
                "layout.0.settings.unusedSecret": "NOT REVIEWER CONTEXT",
            },
        },
    );
    const lease = await f.claim();
    expect(JSON.stringify(lease)).not.toContain(f.feedback.text);
    const context = await f.context(lease);
    expect(context.feedback).toEqual({
        text: f.feedback.text,
        trust: "untrusted-user-input",
    });
    expect(context.context).toMatchObject({
        kind: "text",
        field: "text",
        valueKind: "rich-text",
        value: doc("Public words"),
    });
    const payload = JSON.stringify(context);
    for (const secret of [
        f.member.userId,
        f.member.email,
        f.user.email,
        "PRIVATE DRAFT",
        "NOT REVIEWER CONTEXT",
        "photoMediaIds",
        "actor",
    ])
        expect(payload).not.toContain(secret);
    expect(auth.api.getSession).not.toHaveBeenCalled();
});
test("result creates only one unapproved native text proposal with explicit reviewer provenance and no admin impersonation", async () => {
    const lease = await f.claim();
    const before = JSON.stringify(await PageModel.findById(f.page._id));
    const results = await Promise.all([f.result(lease), f.result(lease)]);
    expect(results[0]).toMatchObject({
        state: "done",
        outcome: "text-proposal",
    });
    expect(results[1].proposalId).toBe(results[0].proposalId);
    const saved = (await ContentChangeModel.findOne({ domain: f.domain._id }))!;
    expect(saved).toMatchObject({
        id: `review-${f.feedback.id}-1`,
        state: { kind: "proposed" },
        approvals: [],
        preparedBy: `feedback-review:${f.grant.id}`,
        provenance: {
            kind: "feedback-review",
            grantId: f.grant.id,
            feedbackId: f.feedback.id,
            generation: 1,
            inputHash: lease.inputHash,
        },
        target: {
            kind: "page-widget",
            pageId: "welcome",
            widgetId: "copy",
            field: "text",
        },
    });
    expect(
        await ContentChangeModel.countDocuments({ domain: f.domain._id }),
    ).toBe(1);
    expect(JSON.stringify(await PageModel.findById(f.page._id))).toBe(before);
    expect(auth.api.getSession).not.toHaveBeenCalled();
    expect(
        feedbackView((await FeedbackModel.findById(f.feedback._id))!, true)
            .review,
    ).toMatchObject({ kind: "done", proposalId: saved.id });
    expect(
        feedbackView((await FeedbackModel.findById(f.feedback._id))!, false)
            .review,
    ).toBeUndefined();
    const approved = await approveChange(saved.id, 1, saved.previewHash, f.ctx);
    expect(approved.state.kind).toBe("applied");
    await f.result(lease);
    expect(
        (await ContentChangeModel.findOne({ id: saved.id }))!.state.kind,
    ).toBe("applied");
});
test("different replay output conflicts; a retained lost-response intent completes without duplicate creation", async () => {
    const lease = await f.claim();
    const original = persistence.retainReviewerProposal;
    jest.spyOn(persistence, "retainReviewerProposal").mockImplementationOnce(
        async (...args) => {
            await original(...args);
            throw new Error("response lost");
        },
    );
    await expect(f.result(lease)).rejects.toThrow("response lost");
    expect(
        (await FeedbackModel.findById(f.feedback._id))!.automaticReview,
    ).toMatchObject({
        kind: "submitting",
        lastFailure: { code: "unavailable" },
    });
    await expect(f.result(lease, escalation)).rejects.toMatchObject({
        code: "result_conflict",
    });
    expect((await f.result(lease)).state).toBe("done");
    expect(
        await ContentChangeModel.countDocuments({ domain: f.domain._id }),
    ).toBe(1);
});
test("marking handled after insertion settles its accepted receipt without reopening feedback", async () => {
    const lease = await f.claim();
    const original = persistence.retainReviewerProposal;
    jest.spyOn(persistence, "retainReviewerProposal").mockImplementationOnce(
        async (...args) => {
            const id = await original(...args);
            await setFeedbackState(f.feedback.id, "close", f.ctx);
            return id;
        },
    );
    expect((await f.result(lease)).state).toBe("done");
    const record = (await FeedbackModel.findById(f.feedback._id))!;
    expect(record.state).toBe("closed");
    expect(record.automaticReview?.kind).toBe("done");
    expect((await f.result(lease)).state).toBe("done");
    await expect(f.context(lease)).rejects.toMatchObject({
        code: "result_accepted",
    });
    expect(
        await ContentChangeModel.countDocuments({ domain: f.domain._id }),
    ).toBe(1);
});
test("claim recovers an already accepted intent after feedback is handled, with no new context", async () => {
    const lease = await f.claim();
    jest.spyOn(persistence, "retainReviewerProposal").mockRejectedValueOnce(
        new Error("interrupted"),
    );
    await expect(f.result(lease)).rejects.toThrow("interrupted");
    await setFeedbackState(f.feedback.id, "close", f.ctx);
    await expect(f.context(lease)).rejects.toMatchObject({
        code: "result_accepted",
    });
    expect(await f.use(claimReview)).toMatchObject({
        recovered: { state: "done", outcome: "text-proposal" },
    });
    expect((await FeedbackModel.findById(f.feedback._id))!.state).toBe(
        "closed",
    );
    expect(
        await ContentChangeModel.countDocuments({ domain: f.domain._id }),
    ).toBe(1);
});
test("newly authorized grant can recover an accepted intent after original revocation, preserving original provenance", async () => {
    const lease = await f.claim();
    jest.spyOn(persistence, "retainReviewerProposal").mockRejectedValueOnce(
        new Error("interrupted"),
    );
    await expect(f.result(lease)).rejects.toThrow("interrupted");
    await revokeGrant(f.grant.id, f.ctx);
    await expect(f.result(lease)).rejects.toMatchObject({
        code: "unauthorized",
    });
    const next = await issueGrant(
        { name: "Replacement", scopes: ["public-page-text"], expiresInDays: 1 },
        f.ctx,
    );
    const recovered = await withReviewer(
        String(f.domain._id),
        next.token,
        "claim",
        claimReview,
    );
    expect(recovered).toMatchObject({
        recovered: { state: "done", outcome: "text-proposal" },
    });
    expect(
        (await ContentChangeModel.findOne({ domain: f.domain._id }))!
            .provenance!.grantId,
    ).toBe(f.grant.id);
});
test("two workers cannot own the same generation; expiry creates a new generation and fences the old output", async () => {
    const [a, b] = await Promise.all([f.use(claimReview), f.use(claimReview)]);
    const lease =
        "claim" in a && a.claim
            ? a.claim
            : "claim" in b && b.claim
              ? b.claim
              : null;
    expect(lease).not.toBeNull();
    expect([a, b].filter((item) => "claim" in item && item.claim)).toHaveLength(
        1,
    );
    await FeedbackModel.updateOne(
        { _id: f.feedback._id },
        { $set: { "automaticReview.leaseUntil": new Date(0).toISOString() } },
    );
    await expect(f.result(lease!)).rejects.toMatchObject({
        code: "lease_expired",
    });
    const next = await f.claim();
    expect(next.generation).toBe(2);
    await expect(f.result(lease!)).rejects.toMatchObject({
        code: "lease_conflict",
    });
    expect((await f.result(next)).state).toBe("done");
    expect(
        await ContentChangeModel.countDocuments({ domain: f.domain._id }),
    ).toBe(1);
});
test("lease expiry during native snapshot preparation cannot accept a late result", async () => {
    const lease = await f.claim();
    const original = preparation.prepareReviewIntent;
    jest.spyOn(preparation, "prepareReviewIntent").mockImplementationOnce(
        async (...args) => {
            const prepared = await original(...args);
            jest.spyOn(Date, "now").mockReturnValue(
                Date.now() + REVIEW_LEASE_MS + 1000,
            );
            return prepared;
        },
    );
    await expect(f.result(lease)).rejects.toMatchObject({
        code: "lease_expired",
    });
    expect(
        await ContentChangeModel.countDocuments({ domain: f.domain._id }),
    ).toBe(0);
});
test("native content edits, closed feedback and new private visibility invalidate leased context and output", async () => {
    const lease = await f.claim();
    await PageModel.updateOne(
        { _id: f.page._id },
        { $set: { draftOnly: true } },
    );
    await expect(f.context(lease)).rejects.toMatchObject({ code: "stale" });
    await expect(f.result(lease)).rejects.toMatchObject({ code: "stale" });
    await FeedbackModel.updateOne(
        { _id: f.feedback._id },
        { $set: { state: "closed" } },
    );
    await expect(f.result(lease)).rejects.toMatchObject({
        code: "lease_conflict",
    });
    expect(
        await ContentChangeModel.countDocuments({ domain: f.domain._id }),
    ).toBe(0);
});
test.each([
    "#copy > div:nth-of-type(1)",
    "#__proto__",
    "#missing",
    "[data-private]",
])(
    "selector-like/unknown component %s escalates without evaluating it",
    async (componentId) => {
        await FeedbackModel.updateOne(
            { _id: f.feedback._id },
            { $set: { "target.componentId": componentId } },
        );
        const lease = await f.claim();
        expect((await f.context(lease)).context.kind).toBe("escalation-only");
        await expect(f.result(lease)).rejects.toMatchObject({
            code: "escalation_required",
        });
        expect((await f.result(lease, escalation)).outcome).toBe("escalation");
        expect(
            await ContentChangeModel.countDocuments({ domain: f.domain._id }),
        ).toBe(0);
    },
);
test.each(["/dashboard/profile", "/api/payment", "/products", "/p/absent"])(
    "private/financial/non-native %s supplies no target text",
    async (path) => {
        await FeedbackModel.updateOne(
            { _id: f.feedback._id },
            { $set: { "target.path": path } },
        );
        const lease = await f.claim();
        expect((await f.context(lease)).context).toMatchObject({
            kind: "escalation-only",
        });
    },
);
test("admin feedback and any attached photo rows are not claimed or returned", async () => {
    await FeedbackModel.updateOne(
        { _id: f.feedback._id },
        {
            $set: {
                actor: { kind: "admin", userId: f.user.userId },
                photoMediaIds: ["private-photo"],
            },
        },
    );
    expect(await f.use(claimReview)).toEqual({ claim: null });
    await FeedbackModel.updateOne(
        { _id: f.feedback._id },
        { $set: { actor: { kind: "member", userId: f.member.userId } } },
    );
    expect(await f.use(claimReview)).toEqual({ claim: null });
});
test("public native lesson context produces the existing lesson proposal while enrolled/drip lessons escalate", async () => {
    const { lesson } = await lessonFeedback();
    const lease = await f.claim();
    expect((await f.context(lease)).context).toMatchObject({
        kind: "text",
        target: { kind: "lesson", lessonId: lesson.lessonId },
    });
    expect((await f.result(lease)).outcome).toBe("text-proposal");
    expect(
        (await ContentChangeModel.findOne({ domain: f.domain._id }))!.state
            .kind,
    ).toBe("proposed");
    expect((await LessonModel.findById(lesson._id)).content).toEqual(
        doc("Public lesson words"),
    );
});
test.each([
    [true, false],
    [false, true],
])(
    "enrollment=%s drip=%s cannot leak member lesson text",
    async (enrolled, drip) => {
        await lessonFeedback(enrolled, drip);
        const context = await f.context(await f.claim());
        expect(context.context).toEqual({
            kind: "escalation-only",
            reason: "private-or-unavailable",
        });
        expect(JSON.stringify(context)).not.toContain("Public lesson words");
    },
);
test("subject account closure waits for an admitted result and cleanup prevents stale-session row recreation", async () => {
    const lease = await f.claim();
    let entered!: () => void, release!: () => void;
    const paused = new Promise<void>((r) => {
        entered = r;
    });
    const resume = new Promise<void>((r) => {
        release = r;
    });
    const original = persistence.retainReviewerProposal;
    jest.spyOn(persistence, "retainReviewerProposal").mockImplementationOnce(
        async (...args) => {
            entered();
            await resume;
            return original(...args);
        },
    );
    const pending = f.result(lease);
    await paused;
    const key = { domainId: String(f.domain._id), userId: f.member.userId };
    expect((await beginAccountClosure(key)).kind).toBe("pending");
    await expect(requireAccountErasureReady(key)).rejects.toMatchObject({
        code: "account_busy",
    });
    release();
    await pending;
    await requireAccountErasureReady(key);
    await FeedbackModel.deleteOne({ _id: f.feedback._id });
    await expect(f.result(lease)).rejects.toMatchObject({
        code: "lease_conflict",
    });
    expect(await FeedbackModel.countDocuments({ _id: f.feedback._id })).toBe(0);
});
test("revocation during admitted result reports draining, blocks other outputs, and preserves its single accepted intent", async () => {
    const lease = await f.claim();
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((r) => {
        enter = r;
    });
    const resume = new Promise<void>((r) => {
        release = r;
    });
    const original = persistence.retainReviewerProposal;
    jest.spyOn(persistence, "retainReviewerProposal").mockImplementationOnce(
        async (...args) => {
            enter();
            await resume;
            return original(...args);
        },
    );
    const pending = f.result(lease);
    await entered;
    expect((await revokeGrant(f.grant.id, f.ctx)).grant.state.kind).toBe(
        "revoking",
    );
    await expect(f.result(lease)).rejects.toMatchObject({
        code: "unauthorized",
    });
    release();
    expect((await pending).state).toBe("done");
    expect(
        await ContentChangeModel.countDocuments({ domain: f.domain._id }),
    ).toBe(1);
});
test("strict result route denies target substitution, approval/media/structure fields, nested prototype keys and oversized payloads", async () => {
    const lease = await f.claim();
    const bound = {
        feedbackId: lease.feedbackId,
        generation: lease.generation,
        leaseId: lease.leaseId,
        inputHash: lease.inputHash,
    };
    for (const result of [
        { ...proposal, target: { kind: "page-create" } },
        { ...proposal, approve: true },
        { ...proposal, replacement: { kind: "image", mediaId: "private" } },
        { kind: "publish", summary: "Publish" },
    ])
        expect(
            (
                await resultRoute(
                    request("/api/feedback-review/result", {
                        ...bound,
                        result,
                    }),
                )
            ).status,
        ).toBe(400);
    const polluted = JSON.stringify({ ...bound, result: proposal }).replace(
        '"replacement":',
        '"__proto__":{},"replacement":',
    );
    expect(
        (await resultRoute(request("/api/feedback-review/result", polluted)))
            .status,
    ).toBe(400);
    expect(
        (
            await resultRoute(
                request("/api/feedback-review/result", {
                    ...bound,
                    result: { ...proposal, summary: "x".repeat(70000) },
                }),
            )
        ).status,
    ).toBe(413);
    const response = await contextRoute(
        request("/api/feedback-review/context", {
            feedbackId: lease.feedbackId,
            generation: lease.generation,
            leaseId: lease.leaseId,
            inputHash: lease.inputHash,
        }),
    );
    expect(response.status).toBe(200);
    expect(
        await ContentChangeModel.countDocuments({ domain: f.domain._id }),
    ).toBe(0);
});

test("normal result REST request accepts only the four lease identity fields plus one unapproved result", async () => {
    const lease = await f.claim();
    const response = await resultRoute(
        request("/api/feedback-review/result", {
            feedbackId: lease.feedbackId,
            generation: lease.generation,
            leaseId: lease.leaseId,
            inputHash: lease.inputHash,
            result: proposal,
        }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        state: "done",
        outcome: "text-proposal",
    });
});

test.each(["inactive", "closing"])(
    "%s authors do not starve later eligible feedback beyond the bounded candidate window",
    async (state) => {
        if (state === "inactive")
            await UserModel.updateOne(
                { _id: f.member._id },
                { $set: { active: false } },
            );
        else
            await beginAccountClosure({
                domainId: String(f.domain._id),
                userId: f.member.userId,
            });
        await FeedbackModel.insertMany(
            Array.from({ length: 25 }, () => ({
                domain: f.domain._id,
                id: randomUUID(),
                text: "Old inactive author",
                target: {
                    kind: "page",
                    path: "/p/welcome",
                    componentId: "#copy",
                },
                actor: { kind: "member", userId: f.member.userId },
                photoMediaIds: [],
                state: "open",
            })),
        );
        const visitor = await FeedbackModel.create({
            domain: f.domain._id,
            id: randomUUID(),
            text: "Current visitor",
            target: { kind: "page", path: "/p/welcome", componentId: "#copy" },
            actor: { kind: "visitor" },
            photoMediaIds: [],
            state: "open",
        });
        expect((await f.claim()).feedbackId).toBe(visitor.id);
    },
);
