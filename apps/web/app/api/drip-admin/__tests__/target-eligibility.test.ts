import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import CourseModel from "@/models/Course";
import { Constants } from "@courselit/common-models";
import {
    createDripChange,
    approveDripChange,
} from "@/services/drip-admin/changes";
import { listDripCourses, readDripCourse } from "@/services/drip-admin/read";
import { DripChangeModel } from "@/services/drip-admin/models";
import { GET, POST } from "../route";
import { GET as getDraft, POST as actOnDraft } from "../[id]/route";

jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@courselit/email-editor/render", () => ({
    renderEmailToHtml: jest.fn().mockResolvedValue(""),
}));

describe("O11 lesson-release target eligibility", () => {
    let domain: any, admin: any, ctx: any;
    const patch = {
        groupId: "one",
        rule: { kind: "relative" as const, delayInMillis: 86400000 },
        groupOrder: ["one"],
        notificationEnabled: false,
    };
    beforeEach(async () => {
        const suffix = randomUUID();
        domain = await DomainModel.create({
            name: `targets-${suffix}`,
            email: `${suffix}@example.com`,
        });
        admin = await UserModel.create({
            domain: domain._id,
            userId: `admin-${suffix}`,
            email: domain.email,
            active: true,
            permissions: ["course:manage_any"],
        });
        ctx = {
            subdomain: domain,
            user: admin,
            address: "https://school.example",
        };
        (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
            user: { email: admin.email },
        });
    });
    afterEach(async () => {
        for (const model of [CourseModel, UserModel, DripChangeModel] as any[])
            await model.deleteMany({ domain: domain._id });
        await DomainModel.deleteOne({ _id: domain._id });
    });
    function product(
        type: "course" | "download" | "blog",
        extra: Record<string, unknown> = {},
    ) {
        const suffix = randomUUID();
        return CourseModel.create({
            domain: domain._id,
            courseId: `product-${suffix}`,
            title: `${type}-${suffix}`,
            slug: `product-${suffix}`,
            creatorId: admin.userId,
            type,
            published: false,
            privacy: "unlisted",
            cost: 0,
            costType: "free",
            groups:
                type === "blog"
                    ? []
                    : [
                          {
                              _id: "one",
                              name: "One",
                              rank: 1000,
                              lessonsOrder: [],
                          },
                      ],
            ...extra,
        });
    }
    function request(path = "", body?: unknown) {
        return new NextRequest(`https://school.example/api/drip-admin${path}`, {
            method: body ? "POST" : "GET",
            headers: {
                domain: domain.name,
                host: "school.example",
                origin: "https://school.example",
                "content-type": "application/json",
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
    }

    it("lists course/download targets and excludes ordinary blog articles", async () => {
        const course = await product("course");
        const download = await product("download");
        const blog = await product("blog");
        const response = await GET(request());
        expect(response.status).toBe(200);
        const { courses } = await response.json();
        expect(courses.map((item: any) => item.courseId).sort()).toEqual(
            [course.courseId, download.courseId].sort(),
        );
        expect(
            courses.some((item: any) => item.courseId === blog.courseId),
        ).toBe(false);
    });
    it("rejects a direct article ID instead of returning an empty release editor", async () => {
        const blog = await product("blog");
        const response = await GET(request(`?courseId=${blog.courseId}`));
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({
            error: { code: "not_found" },
        });
    });
    it("cannot save an article schedule even when a converted article retains an empty section", async () => {
        // A legacy or internally converted article can retain an empty section;
        // groups alone do not prove lesson-release eligibility.
        const blog = await product("blog", {
            groups: [
                {
                    _id: "one",
                    name: "Old section",
                    rank: 1000,
                    lessonsOrder: [],
                },
            ],
        });
        const before = JSON.stringify(
            await CourseModel.findById(blog._id).lean(),
        );
        const response = await POST(
            request("", { courseId: blog.courseId, patch }),
        );
        expect(response.status).toBe(404);
        expect(
            await DripChangeModel.countDocuments({ domain: domain._id }),
        ).toBe(0);
        expect(
            JSON.stringify(await CourseModel.findById(blog._id).lean()),
        ).toBe(before);
    });
    it("rechecks the native type at every existing draft-ID boundary", async () => {
        const course = await product("course");
        const change = await createDripChange(
            { courseId: course.courseId, patch },
            ctx,
        );
        await CourseModel.updateOne(
            { _id: course._id },
            { $set: { type: Constants.CourseType.BLOG }, $inc: { __v: 1 } },
        );
        const before = JSON.stringify(
            await DripChangeModel.findOne({ id: change.id }).lean(),
        );
        const params = { params: Promise.resolve({ id: change.id }) };
        expect((await getDraft(request(`/${change.id}`), params)).status).toBe(
            404,
        );
        for (const action of [
            "approve",
            "refresh",
            "discard",
            "restore",
            "reconcile",
        ]) {
            const body =
                action === "reconcile"
                    ? { action }
                    : action === "approve"
                      ? {
                            action,
                            version: change.version,
                            previewHash: change.previewHash,
                        }
                      : { action, version: change.version };
            expect(
                (await actOnDraft(request(`/${change.id}`, body), params))
                    .status,
            ).toBe(404);
        }
        expect(
            JSON.stringify(
                await DripChangeModel.findOne({ id: change.id }).lean(),
            ),
        ).toBe(before);
        expect(
            (await CourseModel.findById(course._id))!.groups![0].drip?.status,
        ).not.toBe(true);
    });
    it.each(["course", "download"] as const)(
        "preserves native %s draft review and approval",
        async (type) => {
            const course = await product(type);
            expect(
                (await readDripCourse(course.courseId, ctx)).sections,
            ).toHaveLength(1);
            const change = await createDripChange(
                { courseId: course.courseId, patch },
                ctx,
            );
            expect(change.state.kind).toBe("draft");
            expect(
                (
                    await approveDripChange(
                        change.id,
                        change.version,
                        change.previewHash,
                        ctx,
                    )
                ).state.kind,
            ).toBe("applied");
            expect(
                (await CourseModel.findById(course._id))!.groups![0].drip,
            ).toMatchObject({
                status: true,
                type: "relative-date",
                delayInMillis: 86400000,
            });
        },
    );
    it("retains the native own-course permission check and tenant boundary", async () => {
        const own = await product("download");
        const others = await product("course", { creatorId: "another-author" });
        const foreign = await product("course");
        await CourseModel.updateOne(
            { _id: foreign._id },
            { $set: { domain: foreign._id } },
        );
        ctx.user = { ...admin.toObject(), permissions: ["course:manage"] };
        expect(
            (await listDripCourses(ctx)).map((item) => item.courseId),
        ).toEqual([own.courseId]);
        for (const id of [others.courseId, foreign.courseId])
            await expect(readDripCourse(id, ctx)).rejects.toMatchObject({
                code: "not_found",
            });
        await CourseModel.deleteOne({ _id: foreign._id });
    });
});
