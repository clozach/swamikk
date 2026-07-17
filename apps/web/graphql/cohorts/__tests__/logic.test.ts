/**
 * @jest-environment node
 */
import constants from "@/config/constants";
import { responses } from "@/config/strings";
import { Constants } from "@courselit/common-models";
import DomainModel from "@/models/Domain";
import UserModel from "@/models/User";
import CourseModel from "@/models/Course";
import MembershipModel from "@/models/Membership";
import CohortModel from "@/models/Cohort";
import SequenceModel from "@/models/Sequence";
import RuleModel from "@/models/Rule";
import GQLContext from "@/models/GQLContext";
import {
    addCohortMembers,
    createCohort,
    deleteCohort,
    deleteCohortsForCourse,
    getCohort,
    getCohortMembers,
    getCohorts,
    messageCohort,
    removeCohortMembers,
    syncCohortFromCourse,
    updateCohort,
} from "../logic";
import { updateUser } from "../../users/logic";
import { cohortTag } from "../helpers";

const customEmailContent = (body: string) =>
    JSON.stringify({
        content: [{ blockType: "text", settings: { content: body } }],
        style: {
            colors: { background: "#ffffff" },
            typography: { text: { fontFamily: "Arial, sans-serif" } },
            structure: { page: { marginY: "20px" } },
        },
        meta: { previewText: "cohort test" },
    });

const { permissions } = constants;

const SUITE_PREFIX = `cohorts-${Date.now()}-${Math.floor(
    Math.random() * 100000,
)}`;
const id = (suffix: string) => `${SUITE_PREFIX}-${suffix}`;
const email = (suffix: string) => `${suffix}-${SUITE_PREFIX}@example.com`;

describe("Cohorts", () => {
    let testDomain: any;
    let adminUser: any;
    let regularUser: any;
    let course: any;
    let ctx: GQLContext;

    const createMember = async (suffix: string, extras: any = {}) =>
        await UserModel.create({
            domain: testDomain._id,
            userId: id(suffix),
            email: email(suffix),
            name: `Member ${suffix}`,
            permissions: [],
            active: true,
            subscribedToUpdates: true,
            unsubscribeToken: id(`unsub-${suffix}`),
            purchases: [],
            ...extras,
        });

    beforeAll(async () => {
        // The duplicate-name test depends on the compound unique index,
        // which mongoose otherwise builds asynchronously.
        await CohortModel.init();
        testDomain = await DomainModel.create({
            name: id("domain"),
            email: email("domain"),
            settings: { mailingAddress: "12 Test Lane, Testville" },
            quota: {
                mail: {
                    daily: 100,
                    monthly: 1000,
                    dailyCount: 0,
                    monthlyCount: 0,
                },
            },
        });
        adminUser = await UserModel.create({
            domain: testDomain._id,
            userId: id("admin"),
            email: email("admin"),
            name: "Admin User",
            permissions: [permissions.manageUsers],
            active: true,
            unsubscribeToken: id("unsub-admin"),
            purchases: [],
        });
        regularUser = await UserModel.create({
            domain: testDomain._id,
            userId: id("regular"),
            email: email("regular"),
            name: "Regular User",
            permissions: [],
            active: true,
            unsubscribeToken: id("unsub-regular"),
            purchases: [],
        });
        course = await CourseModel.create({
            domain: testDomain._id,
            courseId: id("course"),
            title: "Cohort Test Course",
            slug: id("course-slug"),
            cost: 0,
            costType: "free",
            privacy: "unlisted",
            type: "course",
            creatorId: adminUser.userId,
        });
    });

    beforeEach(async () => {
        testDomain = await DomainModel.findOne({ _id: testDomain._id });
        ctx = {
            subdomain: testDomain,
            user: adminUser,
            address: "https://test.com",
        } as unknown as GQLContext;
    });

    afterEach(async () => {
        await CohortModel.deleteMany({ domain: testDomain._id });
        await SequenceModel.deleteMany({ domain: testDomain._id });
        await RuleModel.deleteMany({ domain: testDomain._id });
        await MembershipModel.deleteMany({ domain: testDomain._id });
        await UserModel.deleteMany({
            domain: testDomain._id,
            userId: { $nin: [adminUser.userId, regularUser.userId] },
        });
        await UserModel.updateMany(
            { domain: testDomain._id },
            { $set: { tags: [] } },
        );
        await DomainModel.updateOne(
            { _id: testDomain._id },
            { $set: { tags: [] } },
        );
        jest.clearAllMocks();
    });

    afterAll(async () => {
        await CourseModel.deleteMany({ domain: testDomain._id });
        await UserModel.deleteMany({ domain: testDomain._id });
        await DomainModel.deleteMany({ _id: testDomain._id });
    });

    describe("permissions", () => {
        it("rejects unauthenticated callers", async () => {
            await expect(
                createCohort({ name: "x", courseId: course.courseId }, {
                    subdomain: testDomain,
                } as any),
            ).rejects.toThrow();
        });

        it("rejects every entry point without manageUsers", async () => {
            const restrictedCtx = {
                ...ctx,
                user: regularUser,
            } as unknown as GQLContext;
            const entryPoints: Array<() => Promise<any>> = [
                () =>
                    createCohort(
                        { name: "x", courseId: course.courseId },
                        restrictedCtx,
                    ),
                () => updateCohort({ cohortId: "x", name: "y" }, restrictedCtx),
                () => deleteCohort("x", restrictedCtx),
                () =>
                    addCohortMembers(
                        { cohortId: "x", userIds: [] },
                        restrictedCtx,
                    ),
                () =>
                    removeCohortMembers(
                        { cohortId: "x", userIds: [] },
                        restrictedCtx,
                    ),
                () => syncCohortFromCourse("x", restrictedCtx),
                () => getCohort("x", restrictedCtx),
                () => getCohorts(restrictedCtx),
                () => getCohortMembers("x", restrictedCtx),
                () =>
                    messageCohort(
                        { cohortId: "x", subject: "x" },
                        restrictedCtx,
                    ),
            ];
            for (const entryPoint of entryPoints) {
                await expect(entryPoint()).rejects.toThrow(
                    responses.action_not_allowed,
                );
            }
        });
    });

    describe("createCohort", () => {
        it("creates a cohort and keeps the reserved tag out of the domain registry", async () => {
            const cohort = await createCohort(
                { name: "April 2026", courseId: course.courseId },
                ctx,
            );

            expect(cohort.cohortId).toBeTruthy();
            expect(cohort.name).toBe("April 2026");
            expect(cohort.courseId).toBe(course.courseId);
            expect(cohort.members).toEqual([]);

            const domain = await DomainModel.findOne({ _id: testDomain._id });
            expect(domain!.tags).not.toContain(cohortTag(cohort.cohortId));
        });

        it("rejects a duplicate name for the same course", async () => {
            await CohortModel.create({
                domain: testDomain._id,
                cohortId: id("dup-cohort"),
                name: "Dup",
                courseId: course.courseId,
                members: [],
            });

            await expect(
                createCohort({ name: "Dup", courseId: course.courseId }, ctx),
            ).rejects.toThrow(responses.cohort_exists);
        });

        it("stores the schedule as dates", async () => {
            const startAt = Date.now() + 86400000;
            const endAt = startAt + 7 * 86400000;
            const cohort = await createCohort(
                {
                    name: "Scheduled",
                    courseId: course.courseId,
                    schedule: { startAt, endAt },
                },
                ctx,
            );

            expect(cohort.schedule?.startAt?.getTime()).toBe(startAt);
            expect(cohort.schedule?.endAt?.getTime()).toBe(endAt);
        });

        it("rejects an unknown course", async () => {
            await expect(
                createCohort(
                    { name: "x", courseId: id("missing-course") },
                    ctx,
                ),
            ).rejects.toThrow(responses.item_not_found);
        });
    });

    describe("updateCohort", () => {
        it("renames and clears the schedule", async () => {
            const cohort = await createCohort(
                {
                    name: "Before",
                    courseId: course.courseId,
                    schedule: { startAt: Date.now() },
                },
                ctx,
            );

            const updated = await updateCohort(
                { cohortId: cohort.cohortId, name: "After", schedule: null },
                ctx,
            );

            expect(updated.name).toBe("After");
            expect(updated.schedule?.startAt).toBeFalsy();
            expect(updated.courseId).toBe(course.courseId);
        });

        it("throws for a missing cohort", async () => {
            await expect(
                updateCohort({ cohortId: id("nope"), name: "x" }, ctx),
            ).rejects.toThrow(responses.item_not_found);
        });
    });

    describe("addCohortMembers / removeCohortMembers", () => {
        it("adds members to the roster and mirrors the tag", async () => {
            const memberA = await createMember("a");
            const memberB = await createMember("b");
            const cohort = await createCohort(
                { name: "Mirror", courseId: course.courseId },
                ctx,
            );

            const updated = await addCohortMembers(
                {
                    cohortId: cohort.cohortId,
                    userIds: [memberA.userId, memberB.userId, id("ghost-user")],
                },
                ctx,
            );

            expect([...updated.members].sort()).toEqual(
                [memberA.userId, memberB.userId].sort(),
            );
            const tagged = await UserModel.find({
                domain: testDomain._id,
                tags: cohortTag(cohort.cohortId),
            });
            expect(tagged.map((user) => user.userId).sort()).toEqual(
                [memberA.userId, memberB.userId].sort(),
            );
        });

        it("is idempotent", async () => {
            const memberA = await createMember("a");
            const cohort = await createCohort(
                { name: "Idem", courseId: course.courseId },
                ctx,
            );

            await addCohortMembers(
                { cohortId: cohort.cohortId, userIds: [memberA.userId] },
                ctx,
            );
            const updated = await addCohortMembers(
                { cohortId: cohort.cohortId, userIds: [memberA.userId] },
                ctx,
            );

            expect(updated.members).toEqual([memberA.userId]);
            const user = await UserModel.findOne({
                domain: testDomain._id,
                userId: memberA.userId,
            });
            expect(
                user!.tags.filter((tag) => tag === cohortTag(cohort.cohortId)),
            ).toHaveLength(1);
        });

        it("removes members from the roster and strips the tag", async () => {
            const memberA = await createMember("a");
            const memberB = await createMember("b");
            const cohort = await createCohort(
                { name: "Remove", courseId: course.courseId },
                ctx,
            );
            await addCohortMembers(
                {
                    cohortId: cohort.cohortId,
                    userIds: [memberA.userId, memberB.userId],
                },
                ctx,
            );

            const updated = await removeCohortMembers(
                { cohortId: cohort.cohortId, userIds: [memberA.userId] },
                ctx,
            );

            expect(updated.members).toEqual([memberB.userId]);
            const removed = await UserModel.findOne({
                domain: testDomain._id,
                userId: memberA.userId,
            });
            expect(removed!.tags).not.toContain(cohortTag(cohort.cohortId));
            const kept = await UserModel.findOne({
                domain: testDomain._id,
                userId: memberB.userId,
            });
            expect(kept!.tags).toContain(cohortTag(cohort.cohortId));
        });
    });

    describe("deleteCohort", () => {
        it("deletes the cohort, strips member tags, and unregisters the domain tag", async () => {
            const memberA = await createMember("a");
            await addTagsToDomain(["keep-me"]);
            const cohort = await createCohort(
                { name: "Doomed", courseId: course.courseId },
                ctx,
            );
            await addCohortMembers(
                { cohortId: cohort.cohortId, userIds: [memberA.userId] },
                ctx,
            );

            await deleteCohort(cohort.cohortId, ctx);

            expect(
                await CohortModel.findOne({
                    domain: testDomain._id,
                    cohortId: cohort.cohortId,
                }),
            ).toBeNull();
            const user = await UserModel.findOne({
                domain: testDomain._id,
                userId: memberA.userId,
            });
            expect(user!.tags).not.toContain(cohortTag(cohort.cohortId));
            const domain = await DomainModel.findOne({ _id: testDomain._id });
            expect(domain!.tags).not.toContain(cohortTag(cohort.cohortId));
            expect(domain!.tags).toContain("keep-me");
        });

        it("sweeps a stray registry entry without touching unrelated tags", async () => {
            await addTagsToDomain(["last-unrelated-tag"]);
            const cohort = await createCohort(
                { name: "Untracked", courseId: course.courseId },
                ctx,
            );
            // Simulate a legacy/manual registration of the reserved tag
            await addTagsToDomain([cohortTag(cohort.cohortId)]);

            await deleteCohort(cohort.cohortId, ctx);

            const domain = await DomainModel.findOne({ _id: testDomain._id });
            expect(domain!.tags).not.toContain(cohortTag(cohort.cohortId));
            expect(domain!.tags).toContain("last-unrelated-tag");
        });

        it("pauses a scheduled broadcast targeting the cohort", async () => {
            const memberA = await createMember("a");
            const cohort = await createCohort(
                { name: "Cancelled", courseId: course.courseId },
                ctx,
            );
            await addCohortMembers(
                { cohortId: cohort.cohortId, userIds: [memberA.userId] },
                ctx,
            );
            const sequence = await messageCohort(
                {
                    cohortId: cohort.cohortId,
                    subject: "Never sends",
                    delayInMillis: Date.now() + 3600000,
                },
                ctx,
            );

            await deleteCohort(cohort.cohortId, ctx);

            const paused: any = await SequenceModel.findOne({
                domain: testDomain._id,
                sequenceId: sequence.sequenceId,
            });
            expect(paused.status).toBe(Constants.sequenceStatus[2]);
            expect(
                await RuleModel.findOne({
                    domain: testDomain._id,
                    sequenceId: sequence.sequenceId,
                }),
            ).toBeNull();
        });

        it("deleteCohortsForCourse removes every cohort of the course and its mirrors", async () => {
            const memberA = await createMember("a");
            const cohort1 = await createCohort(
                { name: "Course C1", courseId: course.courseId },
                ctx,
            );
            const cohort2 = await CohortModel.create({
                domain: testDomain._id,
                cohortId: id("course-c2"),
                name: "Course C2",
                courseId: course.courseId,
                members: [],
            });
            await addCohortMembers(
                { cohortId: cohort1.cohortId, userIds: [memberA.userId] },
                ctx,
            );
            await addCohortMembers(
                { cohortId: cohort2.cohortId, userIds: [memberA.userId] },
                ctx,
            );

            await deleteCohortsForCourse(course.courseId, ctx);

            expect(
                await CohortModel.countDocuments({
                    domain: testDomain._id,
                    courseId: course.courseId,
                }),
            ).toBe(0);
            const member = await UserModel.findOne({
                domain: testDomain._id,
                userId: memberA.userId,
            });
            expect(
                member!.tags.filter((tag) => tag.startsWith("cohort:")),
            ).toEqual([]);
        });
    });

    describe("reads", () => {
        it("getCohort returns the cohort or null", async () => {
            const cohort = await createCohort(
                { name: "Readable", courseId: course.courseId },
                ctx,
            );

            const found = await getCohort(cohort.cohortId, ctx);
            expect(found!.name).toBe("Readable");

            expect(await getCohort(id("missing"), ctx)).toBeNull();
        });

        it("getCohorts lists cohorts, optionally by course", async () => {
            await createCohort({ name: "One", courseId: course.courseId }, ctx);
            const other = await CourseModel.create({
                domain: testDomain._id,
                courseId: id("course-2"),
                title: "Other Course",
                slug: id("course-2-slug"),
                cost: 0,
                costType: "free",
                privacy: "unlisted",
                type: "course",
                creatorId: adminUser.userId,
            });
            await CohortModel.create({
                domain: testDomain._id,
                cohortId: id("cohort-two"),
                name: "Two",
                courseId: other.courseId,
                members: [],
            });

            expect(await getCohorts(ctx)).toHaveLength(2);
            const filtered = await getCohorts(ctx, other.courseId);
            expect(filtered).toHaveLength(1);
            expect(filtered[0].name).toBe("Two");
        });

        it("getCohortMembers resolves roster users", async () => {
            const memberA = await createMember("a");
            await createMember("bystander");
            const cohort = await createCohort(
                { name: "Roster", courseId: course.courseId },
                ctx,
            );
            await addCohortMembers(
                { cohortId: cohort.cohortId, userIds: [memberA.userId] },
                ctx,
            );

            const members = await getCohortMembers(cohort.cohortId, ctx);

            expect(members).toHaveLength(1);
            expect(members[0].userId).toBe(memberA.userId);
            expect(members[0].email).toBe(memberA.email);
        });
    });

    describe("syncCohortFromCourse", () => {
        const enroll = async (userId: string, status: string) =>
            await MembershipModel.create({
                domain: testDomain._id,
                membershipId: id(`membership-${userId}`),
                sessionId: id(`session-${userId}`),
                userId,
                paymentPlanId: id("plan"),
                entityId: course.courseId,
                entityType: Constants.MembershipEntityType.COURSE,
                status,
            });

        it("seeds active course enrollments into the roster and tags them", async () => {
            const memberA = await createMember("a");
            const memberB = await createMember("b");
            const pending = await createMember("pending");
            await enroll(memberA.userId, Constants.MembershipStatus.ACTIVE);
            await enroll(memberB.userId, Constants.MembershipStatus.ACTIVE);
            await enroll(pending.userId, Constants.MembershipStatus.PENDING);
            const cohort = await createCohort(
                { name: "Seeded", courseId: course.courseId },
                ctx,
            );

            const synced = await syncCohortFromCourse(cohort.cohortId, ctx);

            expect([...synced.members].sort()).toEqual(
                [memberA.userId, memberB.userId].sort(),
            );
            const tagged = await UserModel.find({
                domain: testDomain._id,
                tags: cohortTag(cohort.cohortId),
            });
            expect(tagged.map((user) => user.userId).sort()).toEqual(
                [memberA.userId, memberB.userId].sort(),
            );
        });

        it("is idempotent and repairs tag drift", async () => {
            const memberA = await createMember("a");
            await enroll(memberA.userId, Constants.MembershipStatus.ACTIVE);
            const cohort = await createCohort(
                { name: "Repair", courseId: course.courseId },
                ctx,
            );
            await syncCohortFromCourse(cohort.cohortId, ctx);

            // Simulate drift: the mirror tag vanished (e.g. via deleteTag).
            await UserModel.updateOne(
                { domain: testDomain._id, userId: memberA.userId },
                { $pull: { tags: cohortTag(cohort.cohortId) } },
            );

            const synced = await syncCohortFromCourse(cohort.cohortId, ctx);

            expect(synced.members).toEqual([memberA.userId]);
            const user = await UserModel.findOne({
                domain: testDomain._id,
                userId: memberA.userId,
            });
            expect(
                user!.tags.filter((tag) => tag === cohortTag(cohort.cohortId)),
            ).toHaveLength(1);
        });
    });

    describe("messageCohort", () => {
        it("creates a published broadcast targeting the reserved tag", async () => {
            const cohort = await createCohort(
                { name: "Broadcast", courseId: course.courseId },
                ctx,
            );
            const sendAt = Date.now() + 3600000;

            const sequence = await messageCohort(
                {
                    cohortId: cohort.cohortId,
                    subject: "Welcome to the cohort",
                    delayInMillis: sendAt,
                },
                ctx,
            );

            expect(sequence.type).toBe("broadcast");
            expect(sequence.status).toBe(Constants.sequenceStatus[1]);
            expect(sequence.emails[0].published).toBe(true);
            expect(sequence.emails[0].subject).toBe("Welcome to the cohort");
            expect(sequence.emails[0].delayInMillis).toBe(sendAt);
            expect(sequence.filter?.aggregator).toBe("or");
            expect(sequence.filter?.filters).toEqual([
                expect.objectContaining({
                    name: "tag",
                    condition: "Has",
                    value: cohortTag(cohort.cohortId),
                }),
            ]);

            const rule = await RuleModel.findOne({
                domain: testDomain._id,
                sequenceId: sequence.sequenceId,
            });
            expect(rule).not.toBeNull();
            expect(rule!.event).toBe(Constants.EventType.DATE_OCCURRED);
            expect(rule!.eventDateInMillis).toBe(sendAt);
        });

        it("defaults to sending now when no delay is given", async () => {
            const cohort = await createCohort(
                { name: "Now", courseId: course.courseId },
                ctx,
            );
            const before = Date.now();

            const sequence = await messageCohort(
                { cohortId: cohort.cohortId, subject: "Now" },
                ctx,
            );

            const after = Date.now();
            expect(sequence.emails[0].delayInMillis).toBeGreaterThanOrEqual(
                before,
            );
            expect(sequence.emails[0].delayInMillis).toBeLessThanOrEqual(after);
        });

        it("throws for a missing cohort", async () => {
            await expect(
                messageCohort({ cohortId: id("nope"), subject: "x" }, ctx),
            ).rejects.toThrow(responses.item_not_found);
        });

        it("sends custom content that carries the mandatory tags", async () => {
            const cohort = await createCohort(
                { name: "Custom", courseId: course.courseId },
                ctx,
            );

            const sequence = await messageCohort(
                {
                    cohortId: cohort.cohortId,
                    subject: "Custom body",
                    content: customEmailContent(
                        "Special cohort news {{unsubscribe_link}} {{address}}",
                    ),
                },
                ctx,
            );

            expect(JSON.stringify(sequence.emails[0].content)).toContain(
                "Special cohort news",
            );
            expect(sequence.emails[0].published).toBe(true);
        });

        it("rejects content without the mandatory tags and leaves no orphan draft", async () => {
            const cohort = await createCohort(
                { name: "No tags", courseId: course.courseId },
                ctx,
            );

            await expect(
                messageCohort(
                    {
                        cohortId: cohort.cohortId,
                        subject: "x",
                        content: customEmailContent("no mandatory tags here"),
                    },
                    ctx,
                ),
            ).rejects.toThrow(responses.mandatory_tags_missing);

            expect(
                await SequenceModel.countDocuments({
                    domain: testDomain._id,
                }),
            ).toBe(0);
            expect(
                await RuleModel.countDocuments({ domain: testDomain._id }),
            ).toBe(0);
        });

        it("rejects malformed content JSON before creating anything", async () => {
            const cohort = await createCohort(
                { name: "Bad JSON", courseId: course.courseId },
                ctx,
            );

            await expect(
                messageCohort(
                    {
                        cohortId: cohort.cohortId,
                        subject: "x",
                        content: "not-json{",
                    },
                    ctx,
                ),
            ).rejects.toThrow(responses.invalid_input);

            expect(
                await SequenceModel.countDocuments({
                    domain: testDomain._id,
                }),
            ).toBe(0);
        });

        it("rejects a blank subject", async () => {
            const cohort = await createCohort(
                { name: "Blank subject", courseId: course.courseId },
                ctx,
            );

            await expect(
                messageCohort(
                    { cohortId: cohort.cohortId, subject: "   " },
                    ctx,
                ),
            ).rejects.toThrow(responses.invalid_input);
        });

        it("fails loud when the domain cannot send mail", async () => {
            const cohort = await createCohort(
                { name: "No mail", courseId: course.courseId },
                ctx,
            );
            const bareCtx = {
                subdomain: {
                    _id: testDomain._id,
                    settings: {},
                    tags: [],
                    save: jest.fn(),
                },
                user: adminUser,
                address: "https://test.com",
            } as unknown as GQLContext;

            await expect(
                messageCohort(
                    { cohortId: cohort.cohortId, subject: "x" },
                    bareCtx,
                ),
            ).rejects.toThrow(responses.mail_settings_incomplete);
        });
    });

    describe("reserved tag guard", () => {
        it("updateUser can neither remove nor add cohort tags", async () => {
            const memberA = await createMember("a");
            const outsider = await createMember("outsider");
            const cohort = await createCohort(
                { name: "Guarded", courseId: course.courseId },
                ctx,
            );
            await addCohortMembers(
                { cohortId: cohort.cohortId, userIds: [memberA.userId] },
                ctx,
            );

            // A wholesale tags edit that drops the mirror tag must not strip it
            await updateUser({ id: memberA.userId, tags: ["vip"] }, ctx);
            const member = await UserModel.findOne({
                domain: testDomain._id,
                userId: memberA.userId,
            });
            expect(member!.tags).toContain(cohortTag(cohort.cohortId));
            expect(member!.tags).toContain("vip");

            // Hand-adding the reserved tag to a non-member must not stick
            await updateUser(
                { id: outsider.userId, tags: [cohortTag(cohort.cohortId)] },
                ctx,
            );
            const untouched = await UserModel.findOne({
                domain: testDomain._id,
                userId: outsider.userId,
            });
            expect(untouched!.tags).not.toContain(cohortTag(cohort.cohortId));

            // And the reserved tag never reaches the domain registry
            const domain = await DomainModel.findOne({ _id: testDomain._id });
            expect(domain!.tags).not.toContain(cohortTag(cohort.cohortId));
        });
    });

    describe("schema registration", () => {
        it("exposes getCohorts through the root schema", async () => {
            await createCohort(
                { name: "Via schema", courseId: course.courseId },
                ctx,
            );

            const schema = (await import("../../index")).default;
            const { graphql } = require("graphql");
            const result: any = await graphql({
                schema,
                source: `query { getCohorts { cohortId name courseId members } }`,
                contextValue: ctx,
            });

            expect(result.errors).toBeUndefined();
            expect(result.data.getCohorts).toHaveLength(1);
            expect(result.data.getCohorts[0].name).toBe("Via schema");
        });
    });

    const addTagsToDomain = async (tags: string[]) => {
        await DomainModel.updateOne(
            { _id: testDomain._id },
            { $addToSet: { tags: { $each: tags } } },
        );
        ctx.subdomain = (await DomainModel.findOne({
            _id: testDomain._id,
        })) as any;
    };
});
