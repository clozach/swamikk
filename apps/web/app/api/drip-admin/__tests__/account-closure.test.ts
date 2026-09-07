import { randomUUID } from "crypto";
import Domain from "@/models/Domain";
import User from "@/models/User";
import Course from "@/models/Course";
import {
    createDripChange,
    approveDripChange,
    restoreDripChange,
} from "@/services/drip-admin/changes";
import { deleteUserDripChanges } from "@/services/drip-admin/cleanup";
import { DripChangeModel } from "@/services/drip-admin/models";
import {
    beginAccountClosure,
    markAccountErasing,
    finishAccountClosure,
} from "../../../../../../packages/common-logic/src/account-lifecycle/gate";
import { AccountLifecycleModel } from "../../../../../../packages/common-logic/src/account-lifecycle/model";

jest.mock("@courselit/email-editor/render", () => ({
    renderEmailToHtml: jest.fn().mockResolvedValue("<p>Ready</p>"),
}));
let domain: any, admin: any, course: any, ctx: any;
beforeEach(async () => {
    const suffix = randomUUID();
    domain = await Domain.create({
        name: `closure-drip-${suffix}`,
        email: `${suffix}@example.com`,
    });
    admin = await User.create({
        domain: domain._id,
        userId: `admin-${suffix}`,
        email: domain.email,
        active: true,
        permissions: ["course:manage_any"],
    });
    course = await Course.create({
        domain: domain._id,
        courseId: `course-${suffix}`,
        title: "Practice",
        slug: `practice-${suffix}`,
        creatorId: admin.userId,
        type: "course",
        cost: 0,
        costType: "free",
        privacy: "unlisted",
        published: false,
        groups: [
            {
                _id: "one",
                name: "One",
                rank: 1000,
                lessonsOrder: [],
                drip: {
                    status: true,
                    type: "relative-date",
                    delayInMillis: 1000,
                },
            },
        ],
    });
    ctx = { user: admin, subdomain: domain, address: "https://school.example" };
});
afterEach(async () => {
    jest.restoreAllMocks();
    for (const model of [
        User,
        Course,
        DripChangeModel,
        AccountLifecycleModel,
    ] as any[])
        await model.deleteMany({ domain: domain._id });
    await Domain.deleteOne({ _id: domain._id });
});
const key = () => ({ domainId: String(domain._id), userId: admin.userId });
const create = () =>
    createDripChange(
        {
            courseId: course.courseId,
            patch: {
                groupId: "one",
                rule: { kind: "relative", delayInMillis: 2000 },
                groupOrder: ["one"],
                notificationEnabled: false,
            },
        },
        ctx,
    );
async function erase() {
    await markAccountErasing(key());
    await deleteUserDripChanges(String(domain._id), admin.userId);
    await User.deleteOne({ _id: admin._id });
    await finishAccountClosure(key());
}

it.each(["new", "restoration"])(
    "waits for a reserved %s schedule draft and erases it before finishing account closure",
    async (mode) => {
        let operation = create;
        if (mode === "restoration") {
            const previous = await create();
            await approveDripChange(
                previous.id,
                previous.version,
                previous.previewHash,
                ctx,
            );
            operation = () =>
                restoreDripChange(previous.id, previous.version, ctx);
        }
        let entered!: () => void, release!: () => void;
        const began = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const barrier = new Promise<void>((resolve) => {
            release = resolve;
        });
        const original = DripChangeModel.create.bind(DripChangeModel);
        jest.spyOn(DripChangeModel, "create").mockImplementationOnce((async (
            ...args: any[]
        ) => {
            entered();
            await barrier;
            return (original as any)(...args);
        }) as any);
        const creating = operation();
        await began;
        const closure = await beginAccountClosure(key());
        const directCleanup = await deleteUserDripChanges(
            String(domain._id),
            admin.userId,
        ).then(
            () => "erased",
            (error) => error.code,
        );
        if (closure.kind !== "pending") await erase();
        release();
        await creating;
        if (closure.kind === "pending") await erase();
        expect({
            closure: closure.kind,
            directCleanup,
            remaining: await DripChangeModel.countDocuments({
                domain: domain._id,
            }),
        }).toEqual({
            closure: "pending",
            directCleanup: "account_busy",
            remaining: 0,
        });
        // ctx intentionally contains the stale former administrator document.
        await expect(operation()).rejects.toMatchObject({
            code: "account_unavailable",
        });
    },
);

it("rejects a new draft after closure begins without deleting or modifying course content", async () => {
    expect((await beginAccountClosure(key())).kind).toBe("ready");
    await expect(create()).rejects.toMatchObject({
        code: "account_unavailable",
    });
    expect(await DripChangeModel.countDocuments({ domain: domain._id })).toBe(
        0,
    );
    expect(
        (await Course.findById(course._id))!.groups![0].drip!.delayInMillis,
    ).toBe(1000);
});
