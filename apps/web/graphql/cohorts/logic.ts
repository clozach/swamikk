import { Constants } from "@courselit/common-models";
import GQLContext from "@models/GQLContext";
import CohortModel from "@models/Cohort";
import CourseModel from "@models/Course";
import DomainModel from "@models/Domain";
import MembershipModel from "@models/Membership";
import RuleModel from "@models/Rule";
import SequenceModel from "@models/Sequence";
import UserModel from "@models/User";
import { responses } from "../../config/strings";
import { isDuplicateKeyError } from "../pages/helpers";
import {
    createSequence,
    pauseSequence,
    startSequence,
    updateMail,
    updateMailInSequence,
} from "../mails/logic";
import { assertCanManageCohorts, cohortTag } from "./helpers";

const BLANK_SYSTEM_TEMPLATE_ID = "system-5";

interface CohortScheduleInput {
    startAt?: number;
    endAt?: number;
}

const toSchedule = (schedule?: CohortScheduleInput | null) =>
    schedule
        ? {
              ...(schedule.startAt
                  ? { startAt: new Date(schedule.startAt) }
                  : {}),
              ...(schedule.endAt ? { endAt: new Date(schedule.endAt) } : {}),
          }
        : undefined;

const getCohortOrThrow = async (cohortId: string, ctx: GQLContext) => {
    const cohort = await CohortModel.findOne({
        domain: ctx.subdomain._id,
        cohortId,
    });

    if (!cohort) {
        throw new Error(responses.item_not_found);
    }

    return cohort;
};

const existingUserIds = async (
    userIds: string[],
    ctx: GQLContext,
): Promise<string[]> => {
    const users = await UserModel.find(
        { domain: ctx.subdomain._id, userId: { $in: userIds } },
        { userId: 1 },
    );
    return users.map((user) => user.userId);
};

// Roster writes always precede tag writes so a partial failure leaves a
// member visible in the roster without the mirror tag — a state
// syncCohortFromCourse repairs — instead of an invisible tagged non-member.
const addMembers = async (
    cohortId: string,
    userIds: string[],
    ctx: GQLContext,
) => {
    if (userIds.length === 0) {
        return;
    }

    await CohortModel.updateOne(
        { domain: ctx.subdomain._id, cohortId },
        { $addToSet: { members: { $each: userIds } } },
    );
    await UserModel.updateMany(
        { domain: ctx.subdomain._id, userId: { $in: userIds } },
        { $addToSet: { tags: cohortTag(cohortId) } },
    );
};

export const createCohort = async (
    {
        name,
        courseId,
        schedule,
    }: {
        name: string;
        courseId: string;
        schedule?: CohortScheduleInput;
    },
    ctx: GQLContext,
) => {
    assertCanManageCohorts(ctx);

    const course = await CourseModel.findOne({
        domain: ctx.subdomain._id,
        courseId,
    });

    if (!course) {
        throw new Error(responses.item_not_found);
    }

    // The reserved cohort:<id> tag is deliberately NOT registered in the
    // domain tag registry: it mirrors Cohort.members and is managed solely
    // by this module, so it must stay out of the generic tag pickers.
    try {
        return await CohortModel.create({
            domain: ctx.subdomain._id,
            name,
            courseId,
            members: [],
            schedule: toSchedule(schedule),
        });
    } catch (err: any) {
        if (isDuplicateKeyError(err)) {
            throw new Error(responses.cohort_exists);
        }
        throw err;
    }
};

export const updateCohort = async (
    {
        cohortId,
        name,
        schedule,
    }: {
        cohortId: string;
        name?: string;
        schedule?: CohortScheduleInput | null;
    },
    ctx: GQLContext,
) => {
    assertCanManageCohorts(ctx);

    const cohort = await getCohortOrThrow(cohortId, ctx);

    if (name) {
        cohort.name = name;
    }
    if (typeof schedule !== "undefined") {
        cohort.schedule = toSchedule(schedule);
    }

    try {
        await cohort.save();
    } catch (err: any) {
        if (isDuplicateKeyError(err)) {
            throw new Error(responses.cohort_exists);
        }
        throw err;
    }

    return cohort;
};

// Every step is idempotent so a partial failure is retryable: pause
// not-yet-fired broadcasts first (a later failure must not leave a message
// scheduled at a half-deleted cohort), then strip the mirror tag, sweep any
// stray registry entry atomically (never a splice+save of the cached domain
// doc), and delete the roster last.
const removeCohort = async (cohort: { cohortId: string }, ctx: GQLContext) => {
    const tag = cohortTag(cohort.cohortId);

    const pendingBroadcasts = await SequenceModel.find({
        domain: ctx.subdomain._id,
        type: Constants.mailTypes[0],
        status: Constants.sequenceStatus[1],
        "filter.filters": {
            $elemMatch: { name: Constants.UserFilter.TAG, value: tag },
        },
    });
    for (const sequence of pendingBroadcasts) {
        if (
            !sequence.report?.broadcast?.lockedAt &&
            sequence.emails[0]?.delayInMillis > new Date().getTime()
        ) {
            await pauseSequence({ ctx, sequenceId: sequence.sequenceId });
        }
    }

    await UserModel.updateMany(
        { domain: ctx.subdomain._id, tags: tag },
        { $pull: { tags: tag } },
    );
    await DomainModel.updateOne(
        { _id: ctx.subdomain._id },
        { $pull: { tags: tag } },
    );
    await CohortModel.deleteOne({
        domain: ctx.subdomain._id,
        cohortId: cohort.cohortId,
    });
};

export const deleteCohort = async (cohortId: string, ctx: GQLContext) => {
    assertCanManageCohorts(ctx);

    const cohort = await getCohortOrThrow(cohortId, ctx);
    await removeCohort(cohort, ctx);

    return cohort;
};

// Cascade for deleteCourse: authorization is the caller's (course-level)
// gate, so no manageUsers assert here.
export const deleteCohortsForCourse = async (
    courseId: string,
    ctx: GQLContext,
) => {
    const cohorts = await CohortModel.find({
        domain: ctx.subdomain._id,
        courseId,
    });
    for (const cohort of cohorts) {
        await removeCohort(cohort, ctx);
    }
};

export const addCohortMembers = async (
    { cohortId, userIds }: { cohortId: string; userIds: string[] },
    ctx: GQLContext,
) => {
    assertCanManageCohorts(ctx);

    await getCohortOrThrow(cohortId, ctx);
    await addMembers(cohortId, await existingUserIds(userIds, ctx), ctx);

    return getCohortOrThrow(cohortId, ctx);
};

export const removeCohortMembers = async (
    { cohortId, userIds }: { cohortId: string; userIds: string[] },
    ctx: GQLContext,
) => {
    assertCanManageCohorts(ctx);

    await getCohortOrThrow(cohortId, ctx);

    // Mirror image of addMembers: strip the tag first, so a partial
    // failure leaves a roster-visible member still tagged (re-removable),
    // never an invisible tagged non-member.
    await UserModel.updateMany(
        { domain: ctx.subdomain._id, userId: { $in: userIds } },
        { $pull: { tags: cohortTag(cohortId) } },
    );
    await CohortModel.updateOne(
        { domain: ctx.subdomain._id, cohortId },
        { $pull: { members: { $in: userIds } } },
    );

    return getCohortOrThrow(cohortId, ctx);
};

export const getCohort = async (cohortId: string, ctx: GQLContext) => {
    assertCanManageCohorts(ctx);

    return CohortModel.findOne({
        domain: ctx.subdomain._id,
        cohortId,
    });
};

export const getCohorts = async (ctx: GQLContext, courseId?: string) => {
    assertCanManageCohorts(ctx);

    return CohortModel.find({
        domain: ctx.subdomain._id,
        ...(courseId ? { courseId } : {}),
    }).sort({ createdAt: -1 });
};

export const getCohortMembers = async (cohortId: string, ctx: GQLContext) => {
    assertCanManageCohorts(ctx);

    const cohort = await getCohortOrThrow(cohortId, ctx);

    return UserModel.find({
        domain: ctx.subdomain._id,
        userId: { $in: cohort.members },
    });
};

export const syncCohortFromCourse = async (
    cohortId: string,
    ctx: GQLContext,
) => {
    assertCanManageCohorts(ctx);

    const cohort = await getCohortOrThrow(cohortId, ctx);

    const memberships = await MembershipModel.find({
        domain: ctx.subdomain._id,
        entityType: Constants.MembershipEntityType.COURSE,
        entityId: cohort.courseId,
        status: Constants.MembershipStatus.ACTIVE,
    });
    const enrolled = await existingUserIds(
        memberships.map((membership) => membership.userId),
        ctx,
    );

    await addMembers(cohortId, enrolled, ctx);

    // Re-assert the mirror tag across the full roster so drift (e.g. a
    // stray deleteTag) is repaired, not just new enrollments added.
    const synced = await getCohortOrThrow(cohortId, ctx);
    await UserModel.updateMany(
        { domain: ctx.subdomain._id, userId: { $in: synced.members } },
        { $addToSet: { tags: cohortTag(cohortId) } },
    );

    return synced;
};

export const messageCohort = async (
    {
        cohortId,
        subject,
        content,
        templateId,
        delayInMillis,
    }: {
        cohortId: string;
        subject: string;
        content?: string;
        templateId?: string;
        delayInMillis?: number;
    },
    ctx: GQLContext,
) => {
    assertCanManageCohorts(ctx);

    const cohort = await getCohortOrThrow(cohortId, ctx);

    // The queue silently skips sending when these are missing; fail loud
    // at request time instead.
    if (!ctx.subdomain.settings?.mailingAddress || !ctx.subdomain.quota?.mail) {
        throw new Error(responses.mail_settings_incomplete);
    }

    if (!subject.trim()) {
        throw new Error(responses.invalid_input);
    }
    if (content) {
        try {
            JSON.parse(content);
        } catch {
            throw new Error(responses.invalid_input);
        }
    }

    const sequence = await createSequence(
        ctx,
        Constants.mailTypes[0],
        templateId || BLANK_SYSTEM_TEMPLATE_ID,
    );

    if (!sequence) {
        throw new Error(responses.internal_error);
    }

    const filter = JSON.stringify({
        aggregator: "or",
        filters: [
            {
                name: Constants.UserFilter.TAG,
                condition: "Has",
                value: cohortTag(cohortId),
                valueLabel: cohort.name,
            },
        ],
    });

    // A failure past this point must not strand a half-configured draft.
    try {
        await updateMail({
            ctx,
            sequenceId: sequence.sequenceId,
            title: subject,
            filter,
            content,
            delayInMillis: delayInMillis ?? new Date().getTime(),
        });

        await updateMailInSequence({
            ctx,
            sequenceId: sequence.sequenceId,
            emailId: sequence.emails[0].emailId,
            published: true,
        });

        return await startSequence({ ctx, sequenceId: sequence.sequenceId });
    } catch (err) {
        await RuleModel.deleteMany({
            domain: ctx.subdomain._id,
            sequenceId: sequence.sequenceId,
        });
        await SequenceModel.deleteOne({
            domain: ctx.subdomain._id,
            sequenceId: sequence.sequenceId,
            status: Constants.sequenceStatus[0],
        });
        throw err;
    }
};
