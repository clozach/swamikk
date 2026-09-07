import { Constants, type Progress } from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import CourseModel from "@/models/Course";
import LessonModel from "@/models/Lesson";
import { getMemberCourseReadScope, listMemberCourseScopes } from "./index";

export async function projectMemberPurchases(
    domainId: string,
    user: { userId: string; purchases?: Progress[] },
): Promise<Progress[]> {
    const result: Progress[] = [];
    for (const scope of await listMemberCourseScopes({
        domainId,
        userId: user.userId,
    })) {
        if (scope.kind === "none") continue;
        const previous = user.purchases?.find(
            (purchase) => purchase.courseId === scope.courseId,
        );
        let groupIds: string[];
        if (scope.kind === "active") groupIds = scope.groupIds;
        else
            groupIds = await LessonModel.distinct("groupId", {
                domain: domainId,
                courseId: scope.courseId,
                published: true,
                lessonId: { $in: scope.lessonIds },
            });
        result.push({
            ...previous,
            courseId: scope.courseId,
            completedLessons: previous?.completedLessons || [],
            accessibleGroups: groupIds,
            retainedLessonIds: scope.retainedLessonIds,
            ...(scope.kind === "active"
                ? {
                      createdAt: scope.startedAt || previous?.createdAt,
                      lastDripAt:
                          scope.lastRelativeReleaseAt || previous?.lastDripAt,
                  }
                : {}),
        });
    }
    return result;
}

export async function memberCourseLibrary(
    ctx: GQLContext,
    user: { userId: string; purchases?: Progress[] },
): Promise<Record<string, unknown>[]> {
    const result: Record<string, unknown>[] = [];
    for (const scope of await listMemberCourseScopes({
        domainId: String(ctx.subdomain._id),
        userId: user.userId,
    })) {
        if (scope.kind === "none") continue;
        const course = await CourseModel.findOne({
            domain: ctx.subdomain._id,
            courseId: scope.courseId,
            published: true,
        }).lean();
        if (!course) continue;
        const lessons = await LessonModel.find({
            domain: ctx.subdomain._id,
            courseId: course.courseId,
            published: true,
            ...(scope.kind === "restricted"
                ? { lessonId: { $in: scope.lessonIds } }
                : {}),
        })
            .select("lessonId")
            .lean();
        const ids = new Set(lessons.map((lesson) => lesson.lessonId));
        const progress = user.purchases?.find(
            (purchase) => purchase.courseId === course.courseId,
        );
        result.push({
            entityType: Constants.MembershipEntityType.COURSE,
            entity: {
                id: course.courseId,
                title: course.title,
                slug: course.slug,
                type: course.type,
                totalLessons: ids.size,
                completedLessonsCount: ctx.memberMimic
                    ? null
                    : (progress?.completedLessons || []).filter((id) =>
                          ids.has(id),
                      ).length,
                featuredImage: course.featuredImage,
                certificateId: ctx.memberMimic ? null : progress?.certificateId,
            },
        });
    }
    return result;
}

export async function projectCourseForMemberAccess<
    T extends {
        courseId: string;
        groups?: any[];
        firstLesson?: string;
        isPreview?: boolean;
    },
>(course: T, ctx: GQLContext): Promise<T> {
    if (!ctx.user || course.isPreview) return course;
    const scope = await getMemberCourseReadScope({
        domainId: String(ctx.subdomain._id),
        userId: ctx.user.userId,
        courseId: course.courseId,
    });
    if (scope.kind === "none") return course;
    const lessons = await LessonModel.find({
        domain: ctx.subdomain._id,
        courseId: course.courseId,
        published: true,
        ...(scope.kind === "restricted"
            ? { lessonId: { $in: scope.lessonIds } }
            : {}),
    })
        .select("lessonId groupId")
        .lean();
    const visibleIds = new Set(lessons.map((lesson) => lesson.lessonId));
    const allowedIds = new Set(
        lessons
            .filter((lesson) => {
                if (
                    scope.kind === "restricted" ||
                    scope.retainedLessonIds.includes(lesson.lessonId)
                )
                    return true;
                const group = course.groups?.find(
                    (item) => String(item._id || item.id) === lesson.groupId,
                );
                return (
                    group &&
                    (!group.drip?.status ||
                        scope.groupIds.includes(lesson.groupId))
                );
            })
            .map((lesson) => lesson.lessonId),
    );
    const groupIds = new Set(lessons.map((lesson) => lesson.groupId));
    const groups =
        scope.kind === "restricted"
            ? (course.groups || [])
                  .filter((group) =>
                      groupIds.has(String(group._id || group.id)),
                  )
                  .map((group) => ({
                      ...group,
                      lessonsOrder: (group.lessonsOrder || []).filter(
                          (id: string) => visibleIds.has(id),
                      ),
                  }))
            : course.groups || [];
    const firstLesson =
        groups
            .flatMap((group) => group.lessonsOrder || [])
            .find((id) => allowedIds.has(id)) ||
        lessons.find((lesson) => allowedIds.has(lesson.lessonId))?.lessonId ||
        "";
    return { ...course, groups, firstLesson };
}
