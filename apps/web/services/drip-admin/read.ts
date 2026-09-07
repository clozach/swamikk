import CourseModel from "@/models/Course";
import type GQLContext from "@/models/GQLContext";
import { canManageCourseInContext } from "@/graphql/courses/permissions";
import { Constants } from "@courselit/common-models";
import { AccessMembershipModel } from "../../../../packages/common-logic/src/member-access/models";
import { AccessLessonModel } from "../../../../packages/common-logic/src/member-access/models";
import type { InternalLesson } from "@courselit/orm-models";
import type { DripCourseView } from "../../../../packages/common-models/src/drip-change";
import {
    editableCourse,
    requireDripActor,
    releaseCourseTypes,
    type ScheduleCourse,
} from "./guard";
import { DripChangeModel } from "./models";
import { sectionViews } from "./schedule";
import { dripChangeView } from "./changes";

export async function listDripCourses(ctx: GQLContext) {
    requireDripActor(ctx);
    const courses = (await CourseModel.find({
        domain: ctx.subdomain._id,
        type: { $in: releaseCourseTypes },
    })
        .select("courseId title published creatorId")
        .sort({ title: 1 })
        .lean()) as ScheduleCourse[];
    return courses
        .filter((course) => canManageCourseInContext(course, ctx))
        .map((course) => ({
            courseId: course.courseId,
            title: course.title,
            published: course.published,
        }));
}
export async function readDripCourse(
    courseId: string,
    ctx: GQLContext,
): Promise<DripCourseView> {
    const course = await editableCourse(courseId, ctx);
    const [lessons, records, currentMember] = await Promise.all([
        AccessLessonModel.find({ domain: ctx.subdomain._id, courseId }).lean(),
        DripChangeModel.find({ domain: ctx.subdomain._id, courseId })
            .sort({ createdAt: -1 })
            .limit(30),
        AccessMembershipModel.exists({
            domain: ctx.subdomain._id,
            entityId: courseId,
            entityType: Constants.MembershipEntityType.COURSE,
            status: Constants.MembershipStatus.ACTIVE,
        }),
    ]);
    return {
        courseId,
        title: course.title,
        published: course.published,
        availabilityChangesRestricted: course.published || !!currentMember,
        sections: await sectionViews(
            course.groups,
            lessons as unknown as InternalLesson[],
        ),
        changes: records.map(dripChangeView),
    };
}
