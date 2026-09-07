import { Constants } from "@courselit/common-models";
import type {
    LessonAccessDecision,
    MemberCourseReadScope,
} from "../../../common-models/src/member-access";
import {
    AccessCourseModel,
    AccessLessonModel,
    AccessMembershipModel,
    AccessUserModel,
    MembershipAccessModel,
} from "./models";
import { accessDate, accessPeriod } from "./keys";

export async function getMemberCourseReadScope({
    domainId,
    userId,
    courseId,
}: {
    domainId: string;
    userId: string;
    courseId: string;
}): Promise<MemberCourseReadScope> {
    const user = await AccessUserModel.findOne({
        domain: domainId,
        userId,
        active: true,
    })
        .select(
            "userId active purchases.courseId purchases.accessibleGroups purchases.lastDripAt purchases.createdAt",
        )
        .lean();
    if (!user) return { kind: "none", courseId };
    const memberships = await AccessMembershipModel.find({
        domain: domainId,
        userId,
        entityId: courseId,
        entityType: Constants.MembershipEntityType.COURSE,
        status: Constants.MembershipStatus.ACTIVE,
    }).lean();
    const activeMemberships = new Set(
        memberships.map(
            (membership: any) =>
                `${membership.membershipId}:${membership.sessionId}`,
        ),
    );
    const periods = (
        await MembershipAccessModel.find({
            domain: domainId,
            userId,
            courseId,
        }).lean()
    ).map(accessPeriod);
    // Reads never repair persistence, especially in Member Mimic. Active legacy
    // memberships retain their old group facts until activation/queue records a period.
    const purchase = user.purchases?.find(
        (item: any) => item.courseId === courseId,
    );
    for (const membership of memberships) {
        if (
            periods.some(
                (period) =>
                    period.membershipId === membership.membershipId &&
                    period.membershipSessionId === membership.sessionId,
            )
        )
            continue;
        const startedAt =
            membership.accessActivation?.sessionId === membership.sessionId
                ? accessDate(membership.accessActivation.startedAt)
                : undefined;
        periods.push({
            id: "unpersisted",
            domainId,
            userId,
            courseId,
            membershipId: membership.membershipId,
            membershipSessionId: membership.sessionId,
            start: startedAt
                ? { kind: "recorded", at: startedAt }
                : { kind: "legacy-unknown" },
            state: { kind: "active" },
            groupReleases: startedAt
                ? []
                : (purchase?.accessibleGroups || []).map((groupId: string) => ({
                      kind: "legacy-unknown" as const,
                      groupId,
                  })),
            lastRelativeReleaseAt: startedAt
                ? undefined
                : accessDate(purchase?.lastDripAt),
            revision: 0,
            deliveries: [],
            reopenedOperations: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }
    const retained = new Set<string>();
    const capped = new Set<string>();
    const activeGroups = new Set<string>();
    let active = false,
        processing = false;
    let startedAt: Date | undefined, lastRelativeReleaseAt: Date | undefined;
    for (const period of periods) {
        const hasMembership = activeMemberships.has(
            `${period.membershipId}:${period.membershipSessionId}`,
        );
        if (period.state.kind === "ended" || period.state.kind === "prepared") {
            period.state.snapshot.retainedLessonIds.forEach((id) =>
                retained.add(id),
            );
            if (period.state.kind === "prepared" && hasMembership) {
                processing = true;
                period.state.snapshot.visibleLessonIds.forEach((id) =>
                    capped.add(id),
                );
            }
        } else if (period.state.kind === "freezing" && hasMembership) {
            processing = true;
        } else if (period.state.kind === "active" && hasMembership) {
            active = true;
            for (const release of period.groupReleases)
                if (
                    release.kind === "legacy-unknown" ||
                    (accessDate(release.at)?.getTime() ?? Infinity) <=
                        Date.now()
                )
                    activeGroups.add(release.groupId);
            if (
                period.start.kind === "recorded" &&
                (!startedAt || period.start.at < startedAt)
            )
                startedAt = period.start.at;
            const anchor = accessDate(period.lastRelativeReleaseAt);
            if (
                anchor &&
                (!lastRelativeReleaseAt || anchor > lastRelativeReleaseAt)
            )
                lastRelativeReleaseAt = anchor;
        }
    }
    if (active)
        return {
            kind: "active",
            courseId,
            groupIds: Array.from(activeGroups),
            retainedLessonIds: Array.from(retained),
            startedAt,
            lastRelativeReleaseAt,
        };
    if (
        retained.size ||
        processing ||
        periods.some(
            (period) =>
                period.state.kind === "ended" ||
                period.state.kind === "prepared",
        )
    )
        return {
            kind: "restricted",
            courseId,
            lessonIds: Array.from(
                new Set([...Array.from(capped), ...Array.from(retained)]),
            ),
            retainedLessonIds: Array.from(retained),
            processing,
        };
    return { kind: "none", courseId };
}

export async function getLessonAccess({
    domainId,
    userId,
    courseId,
    lessonId,
    requireMembership = false,
}: {
    domainId: string;
    userId?: string;
    courseId: string;
    lessonId: string;
    requireMembership?: boolean;
}): Promise<LessonAccessDecision> {
    const [course, lesson] = await Promise.all([
        AccessCourseModel.findOne({
            domain: domainId,
            courseId,
            published: true,
        }).lean(),
        AccessLessonModel.findOne({
            domain: domainId,
            courseId,
            lessonId,
            published: true,
        }).lean(),
    ]);
    if (!course || !lesson) return { kind: "denied", reason: "unpublished" };
    const group = course.groups?.find(
        (item: any) => String(item._id || item.id) === lesson.groupId,
    );
    if (!group) return { kind: "denied", reason: "not-released" };
    const scope = userId
        ? await getMemberCourseReadScope({ domainId, userId, courseId })
        : { kind: "none" as const, courseId };
    if (scope.kind === "restricted") {
        if (scope.lessonIds.includes(lessonId))
            return {
                kind: "allowed",
                source: scope.retainedLessonIds.includes(lessonId)
                    ? "retained"
                    : "prepared",
            };
        return {
            kind: "denied",
            reason: scope.processing ? "access-processing" : "not-released",
        };
    }
    if (scope.kind === "active") {
        if (scope.retainedLessonIds.includes(lessonId))
            return { kind: "allowed", source: "retained" };
        if (!group.drip?.status || scope.groupIds.includes(lesson.groupId))
            return { kind: "allowed", source: "active" };
        return { kind: "denied", reason: "not-released" };
    }
    if (!requireMembership && !lesson.requiresEnrollment && !group.drip?.status)
        return { kind: "allowed", source: "public" };
    return { kind: "denied", reason: "membership-required" };
}

export async function listMemberCourseScopes({
    domainId,
    userId,
}: {
    domainId: string;
    userId: string;
}): Promise<MemberCourseReadScope[]> {
    const [memberships, periods] = await Promise.all([
        AccessMembershipModel.find({
            domain: domainId,
            userId,
            entityType: Constants.MembershipEntityType.COURSE,
            status: Constants.MembershipStatus.ACTIVE,
        })
            .select("entityId")
            .lean(),
        MembershipAccessModel.find({
            domain: domainId,
            userId,
            "state.kind": { $in: ["prepared", "ended"] },
        })
            .select("courseId")
            .lean(),
    ]);
    const ids = Array.from(
        new Set<string>([
            ...memberships.map((membership: any) => membership.entityId),
            ...periods.map((period) => period.courseId),
        ]),
    );
    const courses = await AccessCourseModel.find({
        domain: domainId,
        courseId: { $in: ids },
        published: true,
    })
        .select("courseId")
        .lean();
    const result: MemberCourseReadScope[] = [];
    for (const course of courses) {
        const scope = await getMemberCourseReadScope({
            domainId,
            userId,
            courseId: course.courseId,
        });
        if (scope.kind === "active") result.push(scope);
        if (
            scope.kind === "restricted" &&
            (await AccessLessonModel.exists({
                domain: domainId,
                courseId: course.courseId,
                published: true,
                lessonId: { $in: scope.lessonIds },
            }))
        )
            result.push(scope);
    }
    return result;
}
