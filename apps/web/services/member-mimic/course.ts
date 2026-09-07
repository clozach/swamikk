import LessonModel from "@/models/Lesson";
import type GQLContext from "@/models/GQLContext";
import type { InternalCourse } from "@courselit/orm-models";

/** Published group metadata must follow the same boundary as the lesson list. */
export async function projectMimicCourse<
    T extends Pick<InternalCourse, "courseId" | "groups">,
>(course: T, ctx: GQLContext): Promise<T> {
    const published = await LessonModel.find({
        domain: ctx.subdomain._id,
        courseId: course.courseId,
        published: true,
    })
        .select("lessonId groupId")
        .lean();
    const ids = new Set(published.map((lesson) => lesson.lessonId));
    const groups = new Set(published.map((lesson) => lesson.groupId));
    return {
        ...course,
        groups: (course.groups || [])
            .filter((group) =>
                groups.has(String((group as any)._id || (group as any).id)),
            )
            .map((group) => ({
                ...group,
                lessonsOrder: (group.lessonsOrder || []).filter((id) =>
                    ids.has(id),
                ),
            })),
    };
}
