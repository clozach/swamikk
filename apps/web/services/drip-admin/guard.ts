import type GQLContext from "@/models/GQLContext";
import CourseModel from "@/models/Course";
import { canManageCourseInContext } from "@/graphql/courses/permissions";
import { requireCondition } from "../content-changes/errors";
import { hasMemberMimicCookie } from "../member-mimic/constants";
import { fingerprint } from "../content-changes/stable";
import type { InternalCourse } from "@courselit/orm-models";
import type { DripChangeReceipt } from "../../../../packages/common-models/src/drip-change";

export type ScheduleCourse = Omit<InternalCourse, "groups"> & {
    groups: NonNullable<InternalCourse["groups"]>;
    __v?: number;
    dripChangeReceipt?: DripChangeReceipt;
};
export function plain<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}
export function scheduleFingerprint(
    course: Pick<ScheduleCourse, "groups" | "published">,
) {
    return fingerprint(
        plain({ groups: course.groups, published: course.published }),
    );
}
export function revisionFilter(revision: number) {
    return revision === 0
        ? { $or: [{ __v: 0 }, { __v: { $exists: false } }] }
        : { __v: revision };
}
export function requireDripActor(ctx: GQLContext) {
    requireCondition(
        ctx.user?.active &&
            String(ctx.user.domain) === String(ctx.subdomain._id) &&
            !ctx.memberMimic,
        "forbidden",
        "Open release scheduling as an administrator.",
        403,
    );
}
export function requireNoMimic(headers: Headers) {
    requireCondition(
        !hasMemberMimicCookie(headers),
        "forbidden",
        "Exit Member Mimic before opening release scheduling.",
        403,
    );
}
export async function editableCourse(
    courseId: string,
    ctx: GQLContext,
): Promise<ScheduleCourse> {
    requireDripActor(ctx);
    const course = (await CourseModel.findOne({
        domain: ctx.subdomain._id,
        courseId,
    }).lean()) as ScheduleCourse | null;
    requireCondition(
        course && canManageCourseInContext(course, ctx),
        "not_found",
        "Course not found or editing is not permitted.",
        404,
    );
    return { ...course, groups: course.groups || [] };
}
