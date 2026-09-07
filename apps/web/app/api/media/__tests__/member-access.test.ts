import { GET as getScormContent } from "../../scorm/lesson/[lessonId]/content/[...path]/route";
import {
    GET as getScormRuntime,
    POST as writeScormRuntime,
} from "../../scorm/lesson/[lessonId]/runtime/route";
import { GET as getZip } from "../../download/[token]/route";
import DownloadLink from "@/models/DownloadLink";
import { getExtractedFile } from "@/lib/scorm/cache";
jest.mock("medialit", () => ({ MediaLit: jest.fn() }));
jest.mock("@/lib/scorm/cache", () => ({
    getExtractedFile: jest.fn(),
    MIME_TYPES: { ".html": "text/html" },
}));
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { Constants } from "@courselit/common-models";
import Domain from "@/models/Domain";
import User from "@/models/User";
import Course from "@/models/Course";
import Lesson from "@/models/Lesson";
import Membership from "@/models/Membership";
import { MembershipAccessModel } from "../../../../../../packages/common-logic/src/member-access/models";
import { auth } from "@/auth";
import { getMedia } from "@/services/medialit";
import { GET } from "../[mediaId]/route";
import {
    startMemberMimic,
    exitMemberMimic,
} from "@/services/member-mimic/session";
import { MemberMimicModel } from "@/services/member-mimic/model";
import { MEMBER_MIMIC_COOKIE } from "@/services/member-mimic/constants";
import { prepareRetention, endMembership } from "@/services/member-access";
import { getLessonDetails } from "@/graphql/lessons/logic";
import { resolveMemberReadContext } from "@/services/member-mimic/context";
jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@/services/medialit", () => ({
    getMedia: jest.fn(),
    sealMedia: jest.fn(),
    deleteMedia: jest.fn(),
}));
let domain: any,
    actor: any,
    member: any,
    membership: any,
    originalFetch: typeof fetch;
const read = (token?: string) =>
    GET(
        new NextRequest("https://school.example/api/media/file", {
            headers: {
                domain: domain.name,
                ...(token ? { cookie: `${MEMBER_MIMIC_COOKIE}=${token}` } : {}),
            },
        }),
        { params: Promise.resolve({ mediaId: "file" }) },
    );
const key = () => ({
    domainId: String(domain._id),
    userId: member.userId,
    courseId: "course",
    membershipId: membership.membershipId,
    membershipSessionId: membership.sessionId,
});
async function enroll(userId: string) {
    return Membership.create({
        domain: domain._id,
        userId,
        membershipId: randomUUID(),
        entityId: "course",
        entityType: Constants.MembershipEntityType.COURSE,
        paymentPlanId: "plan",
        status: Constants.MembershipStatus.ACTIVE,
        sessionId: randomUUID(),
    });
}
beforeEach(async () => {
    domain = await Domain.create({
        name: `access-${randomUUID()}`,
        email: "admin@example.com",
    });
    actor = await User.create({
        domain: domain._id,
        userId: "actor",
        email: "admin@example.com",
        permissions: ["user:manage", "course:manage_any"],
        active: true,
    });
    member = await User.create({
        domain: domain._id,
        userId: "member",
        email: "member@example.com",
        active: true,
        purchases: [
            {
                courseId: "course",
                accessibleGroups: ["open"],
                completedLessons: [],
            },
        ],
    });
    await Course.create({
        domain: domain._id,
        courseId: "course",
        title: "Course",
        slug: "course",
        creatorId: actor.userId,
        published: true,
        cost: 0,
        costType: "free",
        type: "course",
        privacy: "public",
        groups: [
            {
                _id: "open",
                name: "Open",
                rank: 0,
                drip: { type: "relative-date", status: false },
                lessonsOrder: ["lesson"],
            },
        ],
    });
    await Lesson.create({
        domain: domain._id,
        lessonId: "lesson",
        courseId: "course",
        groupId: "open",
        title: "Lesson",
        creatorId: actor.userId,
        type: "audio",
        published: true,
        downloadable: true,
        requiresEnrollment: true,
        media: {
            mediaId: "file",
            mimeType: "audio/mpeg",
            size: 5,
            originalFileName: "audio.mp3",
            access: "private",
        },
        publication: {
            kind: "known",
            source: "native",
            firstPublishedAt: new Date("2026-02-05"),
        },
    });
    // The dated lesson/course fixture existed before the historical cancellation.
    await Course.updateMany(
        { domain: domain._id },
        { $set: { updatedAt: new Date("2026-01-01") } },
        { timestamps: false },
    );
    await Lesson.updateMany(
        { domain: domain._id },
        { $set: { updatedAt: new Date("2026-02-05") } },
        { timestamps: false },
    );
    jest.mocked(auth.api.getSession).mockResolvedValue({
        user: { email: member.email },
        session: { id: "auth-session" },
    } as any);
    jest.mocked(getMedia).mockResolvedValue({
        mediaId: "file",
        file: "https://media.example/file",
        access: Constants.MediaAccessType.PUBLIC,
        originalFileName: "Natural breath — audio.mp3",
    } as any);
    originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue(
        new Response("audio", {
            status: 200,
            headers: { "Content-Type": "audio/mpeg" },
        }),
    );
});
afterEach(async () => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
    await Promise.all(
        [
            Domain,
            User,
            Course,
            Lesson,
            Membership,
            MembershipAccessModel,
            MemberMimicModel,
            DownloadLink,
        ].map((model) => (model as any).deleteMany({})),
    );
});
it("denies stale purchases and a public lesson URL until actual membership exists", async () => {
    expect((await read()).status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
    membership = await enroll(member.userId);
    expect((await read()).status).toBe(200);
    await Membership.updateOne(
        { _id: membership._id },
        { status: Constants.MembershipStatus.EXPIRED },
    );
    expect((await read()).status).toBe(404);
});
it("retains an eligible download but excludes newly added media even in an old unlocked group", async () => {
    membership = await enroll(member.userId);
    await Membership.updateOne(
        { _id: membership._id },
        {
            accessActivation: {
                sessionId: membership.sessionId,
                startedAt: new Date("2026-02-01"),
            },
        },
    );
    const operation = {
        ...key(),
        operationId: "cancel",
        cutoff: new Date("2026-02-10"),
    };
    await prepareRetention(operation);
    await endMembership(operation);
    expect((await read()).status).toBe(200);
    await Lesson.updateOne(
        { lessonId: "lesson" },
        { media: { mediaId: "different" } },
    );
    await Lesson.create({
        domain: domain._id,
        lessonId: "late",
        courseId: "course",
        groupId: "open",
        title: "Late",
        creatorId: actor.userId,
        type: "audio",
        published: true,
        downloadable: true,
        requiresEnrollment: true,
        media: {
            mediaId: "file",
            mimeType: "audio/mpeg",
            size: 5,
            originalFileName: "audio.mp3",
            access: "private",
        },
    });
    expect((await read()).status).toBe(404);
});
it("uses Mimic subject entitlement rather than the administrator's membership, without access writes", async () => {
    await enroll(actor.userId);
    jest.mocked(auth.api.getSession).mockResolvedValue({
        user: { email: actor.email },
        session: { id: "auth-session" },
    } as any);
    const ctx = {
        subdomain: domain,
        user: actor,
        address: "https://school.example",
    } as any;
    const started = await startMemberMimic(
        { userId: member.userId },
        ctx,
        new Headers(),
    );
    expect((await read(started.token)).status).toBe(404);
    const headers = new Headers({
        cookie: `${MEMBER_MIMIC_COOKIE}=${started.token}`,
    });
    let resolved = await resolveMemberReadContext(headers, ctx);
    if (resolved.kind !== "mimic") throw new Error("Mimic expected");
    await expect(
        getLessonDetails("lesson", resolved.context, "course"),
    ).rejects.toThrow("not enrolled");
    membership = await enroll(member.userId);
    expect((await read(started.token)).status).toBe(200);
    resolved = await resolveMemberReadContext(headers, ctx);
    if (resolved.kind !== "mimic") throw new Error("Mimic expected");
    expect(
        (await getLessonDetails("lesson", resolved.context, "course")).lessonId,
    ).toBe("lesson");
    expect(await MembershipAccessModel.countDocuments()).toBe(0);
    await exitMemberMimic(headers, String(domain._id), actor.userId);
    expect((await read(started.token)).status).toBe(404);
});
it("denies draft, non-downloadable, locked, and foreign-tenant owning lessons", async () => {
    membership = await enroll(member.userId);
    for (const changes of [
        { published: false },
        { published: true, downloadable: false },
    ]) {
        await Lesson.updateOne({ lessonId: "lesson" }, changes);
        expect((await read()).status).toBe(404);
    }
    await Lesson.updateOne({ lessonId: "lesson" }, { downloadable: true });
    await User.updateOne(
        { _id: member._id },
        { $set: { "purchases.0.accessibleGroups": [] } },
    );
    await Course.updateOne(
        { courseId: "course" },
        { $set: { "groups.0.drip.status": true } },
    );
    expect((await read()).status).toBe(404);
    jest.mocked(getMedia).mockResolvedValue({
        mediaId: "file",
        file: "https://media.example/file",
        access: Constants.MediaAccessType.PRIVATE,
    } as any);
    await Lesson.updateOne(
        { lessonId: "lesson" },
        { domain: new (require("mongoose").Types.ObjectId)() },
    );
    expect((await read()).status).toBe(404);
});

it("applies the same gate to SCORM files and private runtime instead of stale purchases", async () => {
    await Lesson.updateOne(
        { lessonId: "lesson" },
        {
            type: "scorm",
            content: { mediaId: "file", launchUrl: "index.html" },
        },
    );
    jest.mocked(getExtractedFile).mockResolvedValue(
        Buffer.from("<p>Practice</p>"),
    );
    const request = (method = "GET", mimic = false) =>
        new NextRequest(
            "https://school.example/api/scorm/lesson/lesson/runtime",
            {
                method,
                headers: {
                    domain: domain.name,
                    ...(mimic
                        ? { cookie: `${MEMBER_MIMIC_COOKIE}=expired` }
                        : {}),
                },
                ...(method === "POST"
                    ? {
                          body: JSON.stringify({
                              element: "cmi.core.lesson_status",
                              value: "completed",
                          }),
                      }
                    : {}),
            },
        );
    const runtime = { params: Promise.resolve({ lessonId: "lesson" }) };
    const content = {
        params: Promise.resolve({ lessonId: "lesson", path: ["index.html"] }),
    };
    expect((await getScormContent(request(), content)).status).toBe(403);
    expect((await getScormRuntime(request(), runtime)).status).toBe(403);
    expect((await writeScormRuntime(request("POST"), runtime)).status).toBe(
        403,
    );
    membership = await enroll(member.userId);
    expect(
        (await getScormContent(request(), content)).headers.get(
            "Cache-Control",
        ),
    ).toBe("private, no-store");
    expect((await getScormRuntime(request(), runtime)).status).toBe(200);
    await Lesson.updateOne({ lessonId: "lesson" }, { published: false });
    expect((await getScormContent(request(), content)).status).toBe(403);
    expect((await getScormRuntime(request("GET", true), runtime)).status).toBe(
        403,
    );
    expect(
        (await writeScormRuntime(request("POST", true), runtime)).status,
    ).toBe(403);
});
it("does not let an old download token package cancelled archive or future content", async () => {
    const link = await DownloadLink.create({
        domain: domain._id,
        userId: member.userId,
        courseId: "course",
        token: "token",
        expiresAt: new Date(Date.now() + 60000),
    });
    const req = new NextRequest("https://school.example/api/download/token", {
        headers: { domain: domain.name },
    });
    expect(
        (await getZip(req, { params: Promise.resolve({ token: link.token }) }))
            .status,
    ).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
    membership = await enroll(member.userId);
    await Membership.updateOne(
        { _id: membership._id },
        {
            accessActivation: {
                sessionId: membership.sessionId,
                startedAt: new Date("2026-03-01"),
            },
        },
    );
    const operation = {
        ...key(),
        operationId: "cancel",
        cutoff: new Date("2026-03-10"),
    };
    await prepareRetention(operation);
    await endMembership(operation);
    expect(
        (await getZip(req, { params: Promise.resolve({ token: link.token }) }))
            .status,
    ).toBe(404);
});
