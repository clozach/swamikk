import DomainModel from "@models/Domain";
import UserModel from "@models/User";
import CourseModel from "@models/Course";
import constants from "@/config/constants";
import { responses } from "@/config/strings";
import { Constants } from "@courselit/common-models";
import { updateGroup } from "../logic";

const SUITE_PREFIX = `update-group-drip-${Date.now()}`;
const id = (suffix: string) => `${SUITE_PREFIX}-${suffix}`;
const email = (suffix: string) => `${suffix}-${SUITE_PREFIX}@example.com`;

describe("updateGroup drip status updates", () => {
    let testDomain: any;
    let adminUser: any;

    beforeAll(async () => {
        testDomain = await DomainModel.create({
            name: id("domain"),
            email: email("domain"),
        });

        adminUser = await UserModel.create({
            domain: testDomain._id,
            userId: id("admin-user"),
            email: email("admin"),
            name: "Admin User",
            permissions: [constants.permissions.manageAnyCourse],
            active: true,
            unsubscribeToken: id("unsubscribe-admin"),
            purchases: [],
        });
    });

    beforeEach(async () => {
        await CourseModel.deleteMany({ domain: testDomain._id });
    });

    afterAll(async () => {
        await CourseModel.deleteMany({ domain: testDomain._id });
        await UserModel.deleteMany({ domain: testDomain._id });
        await DomainModel.deleteOne({ _id: testDomain._id });
    });

    it("persists drip.status=false when disabling scheduled release", async () => {
        const groupId = id("group");
        const course = await CourseModel.create({
            domain: testDomain._id,
            courseId: id("course"),
            title: id("course-title"),
            creatorId: adminUser.userId,
            groups: [
                {
                    _id: groupId,
                    name: "Group 1",
                    rank: 1000,
                    collapsed: true,
                    lessonsOrder: [],
                    drip: {
                        status: true,
                        type: Constants.dripType[0],
                        delayInMillis: 2 * 86_400_000,
                    },
                },
            ],
            lessons: [],
            type: "course",
            privacy: "unlisted",
            costType: "free",
            cost: 0,
            slug: id("course-slug"),
        });

        await updateGroup({
            id: groupId,
            courseId: course.courseId,
            drip: {
                status: false,
                type: Constants.dripType[0],
                delayInMillis: 2,
            },
            ctx: {
                subdomain: testDomain,
                user: adminUser,
                address: "",
            },
        });

        const updatedCourse = await CourseModel.findOne({
            domain: testDomain._id,
            courseId: course.courseId,
        }).lean();
        expect(updatedCourse?.groups?.[0]?.drip?.status).toBe(false);
        expect(updatedCourse?.groups?.[0]?.drip?.delayInMillis).toBe(
            2 * constants.relativeDripUnitInMillis,
        );
    });

    it("rejects status-only drip updates when the group has no drip type yet", async () => {
        const groupId = id("group-without-drip");
        const course = await CourseModel.create({
            domain: testDomain._id,
            courseId: id("course-without-drip"),
            title: id("course-title-without-drip"),
            creatorId: adminUser.userId,
            groups: [
                {
                    _id: groupId,
                    name: "Group 1",
                    rank: 1000,
                    collapsed: true,
                    lessonsOrder: [],
                },
            ],
            lessons: [],
            type: "course",
            privacy: "unlisted",
            costType: "free",
            cost: 0,
            slug: id("course-slug-without-drip"),
        });

        await expect(
            updateGroup({
                id: groupId,
                courseId: course.courseId,
                drip: {
                    status: false,
                },
                ctx: {
                    subdomain: testDomain,
                    user: adminUser,
                    address: "",
                },
            }),
        ).rejects.toThrow(responses.invalid_input);

        const updatedCourse = await CourseModel.findOne({
            domain: testDomain._id,
            courseId: course.courseId,
        }).lean();

        expect(updatedCourse?.groups?.[0]?.drip).toBeUndefined();
    });

    it("rejects relative-date drip when delayInMillis is missing", async () => {
        const groupId = id("group-no-delay");
        await CourseModel.create({
            domain: testDomain._id,
            courseId: id("course-no-delay"),
            title: id("course-title-no-delay"),
            creatorId: adminUser.userId,
            groups: [
                {
                    _id: groupId,
                    name: "Group 1",
                    rank: 1000,
                    collapsed: true,
                    lessonsOrder: [],
                },
            ],
            lessons: [],
            type: "course",
            privacy: "unlisted",
            costType: "free",
            cost: 0,
            slug: id("slug-no-delay"),
        });

        await expect(
            updateGroup({
                id: groupId,
                courseId: id("course-no-delay"),
                drip: {
                    type: Constants.dripType[0],
                    status: true,
                },
                ctx: {
                    subdomain: testDomain,
                    user: adminUser,
                    address: "",
                },
            }),
        ).rejects.toThrow(
            "Relative-date drip requires a numeric delayInMillis",
        );
    });

    it("rejects exact-date drip when dateInUTC is missing", async () => {
        const groupId = id("group-no-date");
        await CourseModel.create({
            domain: testDomain._id,
            courseId: id("course-no-date"),
            title: id("course-title-no-date"),
            creatorId: adminUser.userId,
            groups: [
                {
                    _id: groupId,
                    name: "Group 1",
                    rank: 1000,
                    collapsed: true,
                    lessonsOrder: [],
                },
            ],
            lessons: [],
            type: "course",
            privacy: "unlisted",
            costType: "free",
            cost: 0,
            slug: id("slug-no-date"),
        });

        await expect(
            updateGroup({
                id: groupId,
                courseId: id("course-no-date"),
                drip: {
                    type: Constants.dripType[1],
                    status: true,
                },
                ctx: {
                    subdomain: testDomain,
                    user: adminUser,
                    address: "",
                },
            }),
        ).rejects.toThrow("Exact-date drip requires a numeric dateInUTC");
    });

    it("clears dateInUTC when switching from exact-date to relative-date", async () => {
        const groupId = id("group-switch-to-relative");
        await CourseModel.create({
            domain: testDomain._id,
            courseId: id("course-switch-to-relative"),
            title: id("title-switch-to-relative"),
            creatorId: adminUser.userId,
            groups: [
                {
                    _id: groupId,
                    name: "Group 1",
                    rank: 1000,
                    collapsed: true,
                    lessonsOrder: [],
                    drip: {
                        status: true,
                        type: Constants.dripType[1],
                        delayInMillis: null,
                        dateInUTC: 1778929680000,
                    },
                },
            ],
            lessons: [],
            type: "course",
            privacy: "unlisted",
            costType: "free",
            cost: 0,
            slug: id("slug-switch-to-relative"),
        });

        await updateGroup({
            id: groupId,
            courseId: id("course-switch-to-relative"),
            drip: {
                type: Constants.dripType[0],
                delayInMillis: 3,
            },
            ctx: {
                subdomain: testDomain,
                user: adminUser,
                address: "",
            },
        });

        const updatedCourse = await CourseModel.findOne({
            domain: testDomain._id,
            courseId: id("course-switch-to-relative"),
        }).lean();
        expect(updatedCourse?.groups?.[0]?.drip?.type).toBe(
            Constants.dripType[0],
        );
        expect(updatedCourse?.groups?.[0]?.drip?.delayInMillis).toBe(
            3 * constants.relativeDripUnitInMillis,
        );
        expect(updatedCourse?.groups?.[0]?.drip?.dateInUTC).toBeNull();
    });

    it("clears delayInMillis when switching from relative-date to exact-date", async () => {
        const groupId = id("group-switch-to-exact");
        await CourseModel.create({
            domain: testDomain._id,
            courseId: id("course-switch-to-exact"),
            title: id("title-switch-to-exact"),
            creatorId: adminUser.userId,
            groups: [
                {
                    _id: groupId,
                    name: "Group 1",
                    rank: 1000,
                    collapsed: true,
                    lessonsOrder: [],
                    drip: {
                        status: true,
                        type: Constants.dripType[0],
                        delayInMillis: 2 * constants.relativeDripUnitInMillis,
                        dateInUTC: null,
                    },
                },
            ],
            lessons: [],
            type: "course",
            privacy: "unlisted",
            costType: "free",
            cost: 0,
            slug: id("slug-switch-to-exact"),
        });

        await updateGroup({
            id: groupId,
            courseId: id("course-switch-to-exact"),
            drip: {
                type: Constants.dripType[1],
                dateInUTC: 1778929680000,
            },
            ctx: {
                subdomain: testDomain,
                user: adminUser,
                address: "",
            },
        });

        const updatedCourse = await CourseModel.findOne({
            domain: testDomain._id,
            courseId: id("course-switch-to-exact"),
        }).lean();
        expect(updatedCourse?.groups?.[0]?.drip?.type).toBe(
            Constants.dripType[1],
        );
        expect(updatedCourse?.groups?.[0]?.drip?.dateInUTC).toBe(1778929680000);
        expect(updatedCourse?.groups?.[0]?.drip?.delayInMillis).toBeNull();
    });

    it("does not null existing email on a partial drip update without email", async () => {
        const groupId = id("group-keep-email");
        const existingEmail = {
            content: {
                content: [],
                style: { colors: {}, typography: {}, structure: {} },
                meta: {},
            },
            subject: "Lesson available",
            published: true,
            delayInMillis: 0,
        };
        // Insert with raw collection to bypass Mongoose schema validation on the email field
        const collection = CourseModel.collection;
        await collection.insertOne({
            domain: testDomain._id,
            courseId: id("course-keep-email"),
            title: id("title-keep-email"),
            creatorId: adminUser.userId,
            groups: [
                {
                    _id: groupId,
                    name: "Group 1",
                    rank: 1000,
                    collapsed: true,
                    lessonsOrder: [],
                    drip: {
                        status: true,
                        type: Constants.dripType[0],
                        delayInMillis: 2 * constants.relativeDripUnitInMillis,
                        email: existingEmail,
                    },
                },
            ],
            lessons: [],
            type: "course",
            privacy: "unlisted",
            costType: "free",
            cost: 0,
            slug: id("slug-keep-email"),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await updateGroup({
            id: groupId,
            courseId: id("course-keep-email"),
            drip: {
                type: Constants.dripType[0],
                delayInMillis: 5,
                status: false,
            },
            ctx: {
                subdomain: testDomain,
                user: adminUser,
                address: "",
            },
        });

        const updatedCourse = await CourseModel.findOne({
            domain: testDomain._id,
            courseId: id("course-keep-email"),
        }).lean();
        expect(updatedCourse?.groups?.[0]?.drip?.email).toEqual(existingEmail);
    });
    async function delayFixture() {
        return CourseModel.create({
            domain: testDomain._id,
            courseId: id("unit-course"),
            title: id("unit-title"),
            creatorId: adminUser.userId,
            groups: [
                {
                    _id: id("unit-group"),
                    name: "Week 2",
                    rank: 1000,
                    collapsed: true,
                    lessonsOrder: [],
                    drip: {
                        status: true,
                        type: Constants.dripType[0],
                        delayInMillis: 7 * 86400000,
                    },
                },
            ],
            lessons: [],
            type: "course",
            privacy: "unlisted",
            costType: "free",
            cost: 0,
            slug: id("unit-slug"),
        });
    }

    it.each([604800000, -1, Infinity, NaN, 3651, 0.0000001])(
        "rejects invalid or millisecond-shaped day input %s before any course field or revision changes",
        async (delay) => {
            const course = await delayFixture();
            const before = await CourseModel.findById(course._id).lean();
            await expect(
                updateGroup({
                    id: id("unit-group"),
                    courseId: course.courseId,
                    name: "Must not be saved",
                    drip: {
                        status: true,
                        type: Constants.dripType[0],
                        delayInMillis: delay,
                    },
                    ctx: {
                        subdomain: testDomain,
                        user: adminUser,
                        address: "",
                    },
                }),
            ).rejects.toThrow("Relative drip delay must use days");
            expect(await CourseModel.findById(course._id).lean()).toEqual(
                before,
            );
        },
    );

    it.each([0, 0.5, 7, 3650])(
        "accepts %s days and preserves the ordinary editor round-trip",
        async (delay) => {
            const course = await delayFixture();
            const save = (value: number) =>
                updateGroup({
                    id: id("unit-group"),
                    courseId: course.courseId,
                    drip: {
                        status: true,
                        type: Constants.dripType[0],
                        delayInMillis: value,
                    },
                    ctx: {
                        subdomain: testDomain,
                        user: adminUser,
                        address: "",
                    },
                });
            const first = await save(delay);
            expect(first.groups?.[0]?.drip?.delayInMillis).toBe(
                delay * constants.relativeDripUnitInMillis,
            );
            const second = await save(
                first.groups![0].drip!.delayInMillis! /
                    constants.relativeDripUnitInMillis,
            );
            expect(second.groups?.[0]?.drip?.delayInMillis).toBe(
                first.groups?.[0]?.drip?.delayInMillis,
            );
        },
    );
});
