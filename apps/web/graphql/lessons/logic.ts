import {
    getLessonAccess,
    getMemberCourseReadScope,
} from "@/services/member-access";
/**
 * Business logic for managing lessons
 */
import LessonModel, { Lesson } from "../../models/Lesson";
import { responses } from "../../config/strings";
import {
    checkIfAuthenticated,
    checkOwnershipWithoutModel,
} from "../../lib/graphql";
import CourseModel from "../../models/Course";
import {
    evaluateLessonResult,
    getPrevNextCursor,
    lessonValidator,
    removeCorrectAnswersProp,
} from "./helpers";
import constants from "../../config/constants";
import GQLContext from "../../models/GQLContext";
import { deleteMedia, sealMedia } from "../../services/medialit";
import { recordProgress } from "../users/logic";
import {
    Constants,
    Media,
    Progress,
    Quiz,
    ScormContent,
    User,
    LessonWriteGuard,
} from "@courselit/common-models";
import LessonEvaluation from "../../models/LessonEvaluation";
import { checkPermission, extractMediaIDs } from "@courselit/utils";
import { recordActivity } from "../../lib/record-activity";
import { InternalCourse } from "@courselit/orm-models";
import mongoose from "mongoose";
import CertificateModel from "../../models/Certificate";
import { error } from "@/services/logger";
import getDeletedMediaIds from "@/lib/get-deleted-media-ids";
import ActivityModel from "@/models/Activity";
import UserModel from "../../models/User";
import { replaceTempMediaWithSealedMediaInProseMirrorDoc } from "@/lib/replace-temp-media-with-sealed-media-in-prosemirror-doc";
import { canManageCourseInContext } from "../courses/permissions";
import {
    lessonFingerprint,
    lessonRevision,
    lessonWriteFilter,
} from "@/services/content-changes/lesson-guard";
import { ContentChangeError } from "@/services/content-changes/errors";
import { stableJson } from "@/services/content-changes/stable";

const { permissions, quiz, scorm } = constants;

async function canManageLessonCourse(lesson: Lesson, ctx: GQLContext) {
    if (!ctx.user) {
        return false;
    }

    const course = await CourseModel.findOne({
        courseId: lesson.courseId,
        domain: ctx.subdomain._id,
    }).select("creatorId");

    return course ? canManageCourseInContext(course, ctx) : false;
}

export const canViewUnpublished = (ctx: GQLContext, entity: any): boolean => {
    return (
        !!ctx.user &&
        (checkPermission(ctx.user.permissions, [permissions.manageAnyCourse]) ||
            checkOwnershipWithoutModel(entity, ctx))
    );
};

export const getLessonOrThrow = async (
    id: string,
    ctx: GQLContext,
    options?: { courseId?: string },
): Promise<Lesson> => {
    checkIfAuthenticated(ctx);

    const query: Record<string, unknown> = {
        lessonId: id,
        domain: ctx.subdomain._id,
    };
    if (options?.courseId) {
        query.courseId = options.courseId;
    }

    const lesson = await LessonModel.findOne(query);

    if (!lesson) {
        throw new Error(responses.item_not_found);
    }

    if (!checkPermission(ctx.user.permissions, [permissions.manageAnyCourse])) {
        if (!checkOwnershipWithoutModel(lesson, ctx)) {
            throw new Error(responses.item_not_found);
        } else {
            if (
                !checkPermission(ctx.user.permissions, [
                    permissions.manageCourse,
                ])
            ) {
                throw new Error(responses.action_not_allowed);
            }
        }
    }

    return lesson;
};

export const getLesson = async (id: string, ctx: GQLContext) => {
    return await getLessonOrThrow(id, ctx);
};

export const getLessonDetails = async (
    id: string,
    ctx: GQLContext,
    courseId?: string,
    preview: boolean = false,
) => {
    const query: any = {
        lessonId: id,
        domain: ctx.subdomain._id,
    };
    if (courseId) {
        query.courseId = courseId;
    }
    const lesson = await LessonModel.findOne(query);

    if (!lesson) {
        throw new Error(responses.item_not_found);
    }

    const isPreview = preview && (await canManageLessonCourse(lesson, ctx));

    if (!lesson.published && !isPreview) {
        throw new Error(responses.item_not_found);
    }

    if (!isPreview) {
        const access = await getLessonAccess({
            domainId: String(ctx.subdomain._id),
            userId: ctx.user?.userId,
            courseId: lesson.courseId,
            lessonId: lesson.lessonId,
        });
        if (access.kind === "denied")
            throw new Error(
                access.reason === "unpublished"
                    ? responses.item_not_found
                    : access.reason === "membership-required"
                      ? responses.not_enrolled
                      : responses.drip_not_released,
            );
    }
    const memberScope =
        !isPreview && ctx.user
            ? await getMemberCourseReadScope({
                  domainId: String(ctx.subdomain._id),
                  userId: ctx.user.userId,
                  courseId: lesson.courseId,
              })
            : null;

    const { prevLesson, nextLesson } = await getPrevNextCursor(
        lesson.courseId,
        ctx.subdomain._id,
        lesson.lessonId,
        !isPreview,
        memberScope?.kind === "restricted" ? memberScope.lessonIds : undefined,
    );
    lesson.prevLesson = prevLesson;
    lesson.nextLesson = nextLesson;

    if (lesson.type === quiz) {
        return removeCorrectAnswersProp(lesson);
    }

    return lesson;
};

export type LessonWithStringContent = Omit<Lesson, "content"> & {
    content: string;
};

async function sealLessonMedia(
    media: Partial<Media> | null | undefined,
    domain: mongoose.Types.ObjectId | string,
) {
    if (!media?.mediaId) {
        return undefined;
    }

    const sealedMedia = await sealMedia(media.mediaId, domain);
    if (!sealedMedia) {
        return media as Media;
    }

    delete sealedMedia.file;
    return sealedMedia;
}

export const createLesson = async (
    lessonData: LessonWithStringContent,
    ctx: GQLContext,
) => {
    checkIfAuthenticated(ctx);
    if (!checkPermission(ctx.user.permissions, [permissions.manageCourse])) {
        throw new Error(responses.action_not_allowed);
    }

    lessonValidator(lessonData);

    try {
        const course: InternalCourse | null = await CourseModel.findOne({
            courseId: lessonData.courseId,
            domain: ctx.subdomain._id,
        });
        if (!course) throw new Error(responses.item_not_found);
        if (course.isBlog) throw new Error(responses.cannot_add_to_blogs); // TODO: refactor this

        const group = course.groups?.find(
            (group) => (group as any)._id === lessonData.groupId,
        );
        if (!group) {
            throw new Error(responses.group_not_found);
        }

        let lesson = await LessonModel.create({
            domain: ctx.subdomain._id,
            title: lessonData.title,
            type: lessonData.type,
            content: await replaceTempMediaWithSealedMediaInProseMirrorDoc(
                lessonData.content || "",
                ctx.subdomain._id,
            ),
            media: await sealLessonMedia(lessonData.media, ctx.subdomain._id),
            downloadable: lessonData.downloadable,
            creatorId: ctx.user.userId,
            courseId: course.courseId,
            groupId: lessonData.groupId,
            requiresEnrollment: lessonData.requiresEnrollment,
            published: false,
            publication: { kind: "never" },
        });

        if (lessonData.published) {
            lesson = await LessonModel.findOneAndUpdate(
                {
                    _id: lesson._id,
                    published: false,
                    "publication.kind": "never",
                },
                {
                    $set: {
                        published: true,
                        "publication.kind": "known",
                        "publication.source": "native",
                    },
                    $currentDate: { "publication.firstPublishedAt": true },
                    $inc: { __v: 1 },
                },
                { new: true, runValidators: true },
            );
        }
        course.lessons.push(lesson.lessonId);
        group.lessonsOrder.push(lesson.lessonId);
        await (course as any).save();

        return lesson;
    } catch (err: any) {
        throw new Error(err.message);
    }
};

export const updateLesson = async (
    lessonData: Pick<
        LessonWithStringContent,
        | "title"
        | "content"
        | "media"
        | "downloadable"
        | "requiresEnrollment"
        | "published"
        | "type"
    > & { id: string; lessonId: string },
    ctx: GQLContext,
    guard?: LessonWriteGuard,
) => {
    let lesson = await getLessonOrThrow(lessonData.id, ctx);
    if (
        guard &&
        (lessonRevision(lesson) !== guard.revision ||
            lessonFingerprint(lesson) !== guard.fingerprint)
    ) {
        throw new ContentChangeError(
            "stale",
            "This lesson changed. Prepare a new preview before applying.",
            409,
        );
    }
    // All native edits share this atomic compare-and-swap, including the legacy editor.
    // The full content/permission context also detects maintenance writes without __v.
    const writeFilter = lessonWriteFilter(lesson);
    const firstPublication =
        !lesson.published &&
        lessonData.published === true &&
        lesson.publication?.kind === "never";
    const nextRevision = lessonRevision(lesson) + 1;
    lessonData.lessonId = lessonData.id;
    delete (lessonData as any).id;

    lessonData.type = lesson.type;

    const contentUpdated = Object.prototype.hasOwnProperty.call(
        lessonData,
        "content",
    );

    // Build the complete lesson state for validation by merging existing + update data.
    // The validator expects content as a string.
    const completeLessonData: LessonWithStringContent = {
        id: lesson.id,
        domain: lesson.domain,
        lessonId: lesson.lessonId,
        creatorId: lesson.creatorId,
        courseId: lesson.courseId,
        groupId: lesson.groupId,
        title: lessonData.title ?? lesson.title,
        content: contentUpdated
            ? lessonData.content!
            : JSON.stringify(lesson.content || ""),
        media: lessonData.media ?? lesson.media,
        downloadable: lessonData.downloadable ?? lesson.downloadable,
        requiresEnrollment:
            lessonData.requiresEnrollment ?? lesson.requiresEnrollment,
        published: lessonData.published ?? lesson.published,
        type: lessonData.type,
    };

    lessonValidator(completeLessonData);

    // Now apply the partial updates to the lesson document
    const contentMediaIdsMarkedForDeletion: string[] = [];
    if (contentUpdated) {
        const nextContent = (lessonData.content ?? "") as string;
        contentMediaIdsMarkedForDeletion.push(
            ...getDeletedMediaIds(
                JSON.stringify(lesson.content || ""),
                nextContent,
            ),
        );
    }

    for (const key of Object.keys(lessonData)) {
        if (key === "content") {
            lesson.content =
                lessonData.type === Constants.LessonType.TEXT
                    ? await replaceTempMediaWithSealedMediaInProseMirrorDoc(
                          lessonData.content || "",
                          ctx.subdomain._id,
                      )
                    : JSON.parse(lessonData.content);
        } else if (key === "media" && lessonData.media) {
            lesson.media = await sealLessonMedia(
                lessonData.media,
                ctx.subdomain._id,
            );
        } else if (key !== "lessonId" && key !== "id") {
            lesson[key] = lessonData[key];
        }
    }
    if (
        guard &&
        contentUpdated &&
        stableJson(lesson.content) !==
            stableJson(JSON.parse(lessonData.content))
    ) {
        throw new ContentChangeError(
            "preview_changed",
            "Media processing changed the proposed content. Review it in the content editor before publishing.",
            409,
        );
    }
    const fields = [
        "title",
        "type",
        "content",
        "media",
        "downloadable",
        "requiresEnrollment",
        "published",
    ];
    const updates = Object.fromEntries(
        fields
            .map((key) => [key, lesson[key]])
            .filter(([, value]) => value !== undefined),
    );
    if (guard) {
        updates.contentChangeReceipt = {
            outcome: "applied",
            operationId: guard.operationId,
            revision: nextRevision,
            appliedAt: new Date().toISOString(),
        };
    }
    const savedLesson = await LessonModel.findOneAndUpdate(
        writeFilter,
        {
            $set: {
                ...updates,
                ...(firstPublication
                    ? {
                          "publication.kind": "known",
                          "publication.source": "native",
                      }
                    : {}),
            },
            ...(firstPublication
                ? { $currentDate: { "publication.firstPublishedAt": true } }
                : {}),
            $inc: { __v: 1 },
        },
        { new: true, runValidators: true },
    );
    if (!savedLesson)
        throw new ContentChangeError(
            "stale",
            "This lesson changed while saving. Refresh and review your changes.",
            409,
        );
    lesson = savedLesson;
    // Only schedule removal after a confirmed content write. A cleanup error must not
    // misreport a committed lesson edit as failed; the reference-safe GC can retry.
    for (const mediaId of contentMediaIdsMarkedForDeletion) {
        try {
            await deleteMedia(mediaId, ctx.subdomain._id);
        } catch {
            error("Could not schedule removed lesson media for cleanup", {
                lessonId: lesson.lessonId,
                mediaId,
            });
        }
    }
    return lesson;
};

export const deleteLesson = async (id: string, ctx: GQLContext) => {
    const lesson = await getLessonOrThrow(id, ctx);

    try {
        const cleanupTasks: Promise<any>[] = [];

        if (lesson.media?.mediaId) {
            cleanupTasks.push(
                deleteMedia(lesson.media.mediaId, ctx.subdomain._id),
            );
        }

        if (lesson.type === Constants.LessonType.TEXT && lesson.content) {
            const extractedMediaIds = extractMediaIDs(
                JSON.stringify(lesson.content),
            );
            for (const mediaId of Array.from(extractedMediaIds)) {
                cleanupTasks.push(deleteMedia(mediaId, ctx.subdomain._id));
            }
        }

        if (
            lesson.type === Constants.LessonType.SCORM &&
            lesson.content &&
            (lesson.content as ScormContent).mediaId
        ) {
            cleanupTasks.push(
                deleteMedia(
                    (lesson.content as ScormContent).mediaId!,
                    ctx.subdomain._id,
                ),
            );
        }

        cleanupTasks.push(
            LessonEvaluation.deleteMany({
                domain: ctx.subdomain._id,
                lessonId: lesson.lessonId,
            }),
        );
        cleanupTasks.push(
            ActivityModel.deleteMany({
                domain: ctx.subdomain._id,
                entityId: lesson.lessonId,
            }),
        );
        cleanupTasks.push(
            LessonModel.deleteOne({
                _id: lesson.id,
                domain: ctx.subdomain._id,
            }),
        );

        await Promise.all(cleanupTasks);

        const courseUpdateResult = await CourseModel.updateOne(
            {
                domain: ctx.subdomain._id,
                lessons: lesson.lessonId,
            },
            {
                $pull: { lessons: lesson.lessonId },
            },
        );

        if (courseUpdateResult.matchedCount === 0) {
            return false;
        }

        return true;
    } catch (err: any) {
        throw new Error(err.message);
    }
};

export const getAllLessons = async (
    course: InternalCourse,
    ctx: GQLContext,
    forcePublishedOnly: boolean = false,
) => {
    const canViewUnpublishedLessons =
        !forcePublishedOnly && canViewUnpublished(ctx, course);

    const query: Record<string, unknown> = {
        courseId: course.courseId,
        domain: ctx.subdomain._id,
    };

    if (!canViewUnpublishedLessons) {
        query.published = true;
    }

    if (!(course as any).isPreview && ctx.user) {
        const memberScope = await getMemberCourseReadScope({
            domainId: String(ctx.subdomain._id),
            userId: ctx.user.userId,
            courseId: course.courseId,
        });
        if (memberScope.kind === "restricted")
            query.lessonId = { $in: memberScope.lessonIds };
    }
    const lessons = await LessonModel.find(query, {
        id: 1,
        lessonId: 1,
        type: 1,
        title: 1,
        requiresEnrollment: 1,
        courseId: 1,
        groupId: 1,
        published: 1,
    });

    return lessons;
};

export const deleteAllLessons = async (courseId: string, ctx: GQLContext) => {
    const allLessons = await LessonModel.find<Lesson>({
        domain: ctx.subdomain._id,
        courseId,
    });
    for (const lesson of allLessons) {
        await deleteLesson(lesson.lessonId, ctx);
    }
};

export const markLessonCompleted = async (
    lessonId: string,
    ctx: GQLContext,
) => {
    checkIfAuthenticated(ctx);

    const lesson = await LessonModel.findOne<Lesson>({
        domain: ctx.subdomain._id,
        lessonId,
    });
    if (!lesson || !lesson.published) {
        throw new Error(responses.item_not_found);
    }

    const enrolledItemIndex = ctx.user.purchases.findIndex(
        (progress: Progress) => progress.courseId === lesson.courseId,
    );

    if (enrolledItemIndex === -1) {
        throw new Error(responses.not_enrolled);
    }

    const access = await getLessonAccess({
        domainId: String(ctx.subdomain._id),
        userId: ctx.user.userId,
        courseId: lesson.courseId,
        lessonId: lesson.lessonId,
        requireMembership: true,
    });
    if (access.kind === "denied") {
        throw new Error(
            access.reason === "membership-required"
                ? responses.not_enrolled
                : access.reason === "unpublished"
                  ? responses.item_not_found
                  : responses.drip_not_released,
        );
    }

    if (lesson.type === quiz) {
        const lessonEvaluations = await LessonEvaluation.countDocuments({
            pass: true,
            lessonId: lesson.lessonId,
            userId: ctx.user.userId,
            domain: ctx.subdomain._id,
        });
        if (lessonEvaluations === 0) {
            throw new Error(responses.need_to_pass);
        }
    }

    // Check SCORM completion status
    if (lesson.type === scorm) {
        // Re-fetch user using .lean() to get a plain JS object.
        const freshUser: any = await UserModel.findById(ctx.user._id).lean();
        const purchase = freshUser?.purchases?.[enrolledItemIndex];
        const lessonData = (purchase as any)?.scormData?.lessons?.[lessonId];

        let isCompleted = false;

        if (lessonData?.cmi) {
            // SCORM 1.2
            const status12 = lessonData.cmi.core?.lesson_status;
            // SCORM 2004
            const completion2004 = lessonData.cmi.completion_status;
            const success2004 = lessonData.cmi.success_status;

            isCompleted =
                status12 === "completed" ||
                status12 === "passed" ||
                completion2004 === "completed" ||
                success2004 === "passed";

            // Fallback: Allow completion if user has interacted (saved data exists)
            if (!isCompleted) {
                const hasData =
                    !!lessonData.cmi.suspend_data ||
                    !!lessonData.cmi.core?.session_time ||
                    !!lessonData.cmi.core?.exit;
                if (hasData) {
                    isCompleted = true;
                }
            }
        }

        if (!isCompleted) {
            throw new Error("Please complete the SCORM content first");
        }
    }

    await recordProgress({
        lessonId,
        courseId: lesson.courseId,
        user: ctx.user as unknown as User,
    });

    await recordActivity({
        domain: ctx.subdomain._id,
        userId: ctx.user.userId,
        type: Constants.ActivityType.LESSON_COMPLETED,
        entityId: lesson.lessonId,
        metadata: {
            courseId: lesson.courseId,
        },
    });

    await checkAndRecordCourseCompletion(lesson.courseId, ctx);

    return true;
};

const checkAndRecordCourseCompletion = async (
    courseId: string,
    ctx: GQLContext,
) => {
    const course = await CourseModel.findOne({
        domain: ctx.subdomain._id,
        courseId,
    });
    if (!course) {
        throw new Error(responses.item_not_found);
    }

    const publishedLessons = await LessonModel.find(
        {
            courseId: course.courseId,
            domain: ctx.subdomain._id,
            published: true,
        },
        {
            lessonId: 1,
        },
    );
    const publishedLessonIds = publishedLessons.map(
        (lesson) => lesson.lessonId,
    );
    if (publishedLessonIds.length === 0) {
        return false;
    }

    const progress = ctx.user.purchases.find(
        (purchase: Progress) => purchase.courseId === course.courseId,
    );
    if (!progress) {
        return false;
    }

    const completedLessons = new Set(progress.completedLessons);
    const isCourseCompleted = publishedLessonIds.every((lessonId) =>
        completedLessons.has(lessonId),
    );

    if (!isCourseCompleted) {
        return false;
    }

    await recordActivity({
        domain: ctx.subdomain._id,
        userId: ctx.user.userId,
        type: Constants.ActivityType.COURSE_COMPLETED,
        entityId: courseId,
    });

    if (course.certificate) {
        await issueCertificate(course, ctx);
    }

    return true;
};

const issueCertificate = async (
    course: InternalCourse,
    ctx: GQLContext,
): Promise<void> => {
    const existingCertificate = await CertificateModel.findOne({
        domain: ctx.subdomain._id,
        courseId: course.courseId,
        userId: ctx.user.userId,
    });
    if (existingCertificate) {
        return;
    }

    const certificate = await CertificateModel.create({
        domain: ctx.subdomain._id,
        courseId: course.courseId,
        userId: ctx.user.userId,
    });

    const enrolledItemIndex = ctx.user.purchases.findIndex(
        (progress: Progress) => progress.courseId === course.courseId,
    );

    if (enrolledItemIndex === -1) {
        error(
            `Error in issuing certificate due to course not found in user's purchases`,
            {
                courseId: course.courseId,
                userId: ctx.user.userId,
            },
        );
        return;
    }

    ctx.user.purchases[enrolledItemIndex].certificateId =
        certificate.certificateId;
    await (ctx.user as any).save();

    await recordActivity({
        domain: ctx.subdomain._id,
        userId: ctx.user.userId,
        type: Constants.ActivityType.CERTIFICATE_ISSUED,
        entityId: course.courseId,
    });
};

export const evaluateLesson = async (
    lessonId: string,
    answers: { answers: number[][] },
    ctx: GQLContext,
) => {
    checkIfAuthenticated(ctx);

    const lesson = await LessonModel.findOne<Lesson>({
        domain: ctx.subdomain._id,
        lessonId,
    });
    if (!lesson || !lesson.published) {
        throw new Error(responses.item_not_found);
    }

    const enrolledItemIndex = ctx.user.purchases.findIndex(
        (progress: Progress) => progress.courseId === lesson.courseId,
    );

    if (enrolledItemIndex === -1) {
        throw new Error(responses.not_enrolled);
    }

    const access = await getLessonAccess({
        domainId: String(ctx.subdomain._id),
        userId: ctx.user.userId,
        courseId: lesson.courseId,
        lessonId: lesson.lessonId,
        requireMembership: true,
    });
    if (access.kind === "denied") {
        throw new Error(
            access.reason === "membership-required"
                ? responses.not_enrolled
                : access.reason === "unpublished"
                  ? responses.item_not_found
                  : responses.drip_not_released,
        );
    }

    if (lesson.type !== quiz) {
        throw new Error(responses.cannot_be_evaluated);
    }

    if (!answers.answers || !answers.answers.length) {
        throw new Error(responses.answers_missing);
    }

    const { pass, score } = evaluateLessonResult(
        lesson.content as Quiz,
        answers.answers,
    );

    await LessonEvaluation.create({
        domain: ctx.subdomain._id,
        lessonId: lesson.lessonId,
        userId: ctx.user.userId,
        pass,
        score,
        requiresPassingGrade: (lesson.content as Quiz).requiresPassingGrade,
        passingGrade: (lesson.content as Quiz).passingGrade,
    });

    return {
        pass,
        score,
        requiresPassingGrade: (lesson.content as Quiz).requiresPassingGrade,
        passingGrade: (lesson.content as Quiz).passingGrade,
    };
};
