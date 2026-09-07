import type GQLContext from "@/models/GQLContext";
import { Constants } from "@courselit/common-models";
import type {
    InternalMembership,
    InternalUser,
    InternalLesson,
} from "@courselit/orm-models";
import type { InternalMembershipAccess } from "../../../../packages/orm-models/src/models/member-access";
import type {
    DripChangePatch,
    DripPreview,
    DripImpact,
} from "../../../../packages/common-models/src/drip-change";
import {
    resolveDripSchedule,
    scheduleGroupId,
} from "../../../../packages/common-logic/src/drip-schedule";
import {
    AccessMembershipModel,
    AccessLessonModel,
    AccessUserModel,
    MembershipAccessModel,
} from "../../../../packages/common-logic/src/member-access/models";
import { fingerprint } from "../content-changes/stable";
import { requireCondition } from "../content-changes/errors";
import { editableCourse, plain, scheduleFingerprint } from "./guard";
import { applySchedulePatch, sectionViews } from "./schedule";

const REVIEW_MS = 5 * 60_000;
const MAX_AUDIENCE = 5000;
const timestamp = (value: unknown): number | undefined => {
    if (!value) return undefined;
    const result = new Date(value as string).getTime();
    return Number.isFinite(result) ? result : undefined;
};

export async function prepareDripPreview(
    courseId: string,
    patch: DripChangePatch,
    ctx: GQLContext,
    now = new Date(),
) {
    const course = await editableCourse(courseId, ctx);
    const groups = applySchedulePatch(course, patch);
    const [memberships, periods, lessons] = (await Promise.all([
        AccessMembershipModel.find({
            domain: ctx.subdomain._id,
            entityId: courseId,
            entityType: Constants.MembershipEntityType.COURSE,
            status: Constants.MembershipStatus.ACTIVE,
        })
            .sort({ membershipId: 1 })
            .limit(MAX_AUDIENCE + 1)
            .lean(),
        MembershipAccessModel.find({ domain: ctx.subdomain._id, courseId })
            .sort({ id: 1 })
            .limit(MAX_AUDIENCE + 1)
            .lean(),
        AccessLessonModel.find({ domain: ctx.subdomain._id, courseId }).lean(),
    ])) as unknown as [
        InternalMembership[],
        InternalMembershipAccess[],
        InternalLesson[],
    ];
    const users = (await AccessUserModel.find({
        domain: ctx.subdomain._id,
        active: true,
        userId: { $in: memberships.map((membership) => membership.userId) },
    })
        .select("userId purchases")
        .sort({ userId: 1 })
        .lean()) as unknown as InternalUser[];
    requireCondition(
        memberships.length <= MAX_AUDIENCE &&
            periods.length <= MAX_AUDIENCE &&
            users.length <= MAX_AUDIENCE,
        "audience_limit",
        "This audience needs a larger review before its schedule can be changed.",
        409,
    );
    const previousGroup = course.groups.find(
        (group) => scheduleGroupId(group) === patch.groupId,
    )!;
    const changesAvailability =
        !previousGroup.drip?.status !== (patch.rule.kind === "available");
    requireCondition(
        !changesAvailability || (!course.published && memberships.length === 0),
        "availability_requires_migration",
        "To change Available now to or from a schedule, use an unpublished collection with no current memberships. Existing member availability must first be preserved. Date, delay, order and notification changes remain available.",
        409,
    );
    const [before, after] = await Promise.all([
        sectionViews(course.groups, lessons),
        sectionViews(groups, lessons),
    ]);
    const selected = after.find((section) => section.id === patch.groupId)!;
    requireCondition(
        !patch.notificationEnabled || !!selected.notification?.html,
        "invalid_message",
        "The existing release message could not be previewed. Repair it before enabling notifications.",
    );
    const impact: DripImpact = {
        activeMembers: 0,
        processingMembers: 0,
        endedPeriods: periods.filter((period) => period.state.kind === "ended")
            .length,
        alreadyReleased: 0,
        newlyAvailableNow: 0,
        notificationRecipientsNow: 0,
        notificationSectionIds: [],
        unknownAnchors: 0,
        pendingMessages: 0,
        dispatchingMessages: 0,
        sentMessages: 0,
        uncertainMessages: 0,
        samples: [],
    };
    const nowUTC = now.getTime();
    const snapshots: unknown[] = [];
    const activeUsers = new Set<string>(),
        processingUsers = new Set<string>(),
        releasedUsers = new Set<string>(),
        recipientUsers = new Set<string>(),
        unknownUsers = new Set<string>();
    const visibility = new Map<
        string,
        { before: Set<string>; after: Set<string> }
    >();
    for (const membership of memberships) {
        const user = users.find((item) => item.userId === membership.userId);
        // Inactive/deleted users receive neither grants nor notifications.
        if (!user) continue;
        const period = periods.find(
            (item) =>
                item.membershipId === membership.membershipId &&
                item.membershipSessionId === membership.sessionId,
        );
        if (period && period.state.kind !== "active") {
            processingUsers.add(membership.userId);
            continue;
        }
        activeUsers.add(membership.userId);
        const purchase = user.purchases.find(
            (item) => item.courseId === courseId,
        );
        const recorded =
            membership.accessActivation?.sessionId === membership.sessionId
                ? timestamp(membership.accessActivation.startedAt)
                : undefined;
        const accessible = period
            ? period.groupReleases.map((item) => item.groupId)
            : recorded
              ? []
              : purchase?.accessibleGroups || [];
        const anchor =
            timestamp(period?.lastRelativeReleaseAt) ??
            (period?.start.kind === "recorded"
                ? timestamp(period.start.at)
                : (recorded ??
                  timestamp(purchase?.lastDripAt) ??
                  timestamp(purchase?.createdAt)));
        if (anchor === undefined) unknownUsers.add(membership.userId);
        if (accessible.includes(patch.groupId))
            releasedUsers.add(membership.userId);
        const oldSchedule = resolveDripSchedule({
            groups: course.groups,
            accessibleGroupIds: accessible,
            anchorAt: anchor,
            now: nowUTC,
        });
        const nextSchedule = resolveDripSchedule({
            groups,
            accessibleGroupIds: accessible,
            anchorAt: anchor,
            now: nowUTC,
        });
        const visibleBefore = [
            ...accessible,
            ...course.groups
                .filter((group) => !group.drip?.status)
                .map(scheduleGroupId),
            ...oldSchedule.dueGroupIds,
        ];
        const visibleAfter = [
            ...accessible,
            ...groups
                .filter((group) => !group.drip?.status)
                .map(scheduleGroupId),
            ...nextSchedule.dueGroupIds,
        ];
        const memberVisibility = visibility.get(membership.userId) || {
            before: new Set<string>(),
            after: new Set<string>(),
        };
        visibleBefore.forEach((id) => memberVisibility.before.add(id));
        visibleAfter.forEach((id) => memberVisibility.after.add(id));
        visibility.set(membership.userId, memberVisibility);
        const pendingIds =
            period?.deliveries
                .filter((delivery) => delivery.state.kind === "pending")
                .map((delivery) => delivery.groupId) || [];
        const messageIds = [...nextSchedule.dueGroupIds, ...pendingIds].filter(
            (id) =>
                groups.find((group) => scheduleGroupId(group) === id)?.drip
                    ?.email?.published === true,
        );
        if (course.published && messageIds.length) {
            recipientUsers.add(membership.userId);
            impact.notificationSectionIds = Array.from(
                new Set([...impact.notificationSectionIds, ...messageIds]),
            ).sort();
        }
        if (impact.samples.length < 3)
            impact.samples.push({
                label: `Current enrollment ${impact.samples.length + 1}${accessible.includes(patch.groupId) ? " · already released" : ""}`,
                before: accessible.includes(patch.groupId)
                    ? "released"
                    : oldSchedule.dates[patch.groupId] == null
                      ? null
                      : new Date(
                            oldSchedule.dates[patch.groupId]!,
                        ).toISOString(),
                after: accessible.includes(patch.groupId)
                    ? "released"
                    : nextSchedule.dates[patch.groupId] == null
                      ? null
                      : new Date(
                            nextSchedule.dates[patch.groupId]!,
                        ).toISOString(),
            });
        snapshots.push({
            membershipId: membership.membershipId,
            sessionId: membership.sessionId,
            anchor,
            accessible,
            revision: period?.revision,
            beforeDue: oldSchedule.dueGroupIds,
            afterDue: nextSchedule.dueGroupIds,
        });
    }
    impact.activeMembers = activeUsers.size;
    impact.processingMembers = processingUsers.size;
    impact.alreadyReleased = releasedUsers.size;
    impact.notificationRecipientsNow = recipientUsers.size;
    impact.unknownAnchors = unknownUsers.size;
    if (course.published)
        visibility.forEach((value) => {
            if (
                Array.from(value.after).some(
                    (id) =>
                        !value.before.has(id) &&
                        lessons.some(
                            (lesson) =>
                                lesson.groupId === id && lesson.published,
                        ),
                )
            )
                impact.newlyAvailableNow++;
        });
    for (const period of periods)
        for (const delivery of period.deliveries) {
            if (delivery.groupId !== patch.groupId) continue;
            if (delivery.state.kind === "pending") impact.pendingMessages++;
            if (delivery.state.kind === "dispatching")
                impact.dispatchingMessages++;
            if (delivery.state.kind === "sent") impact.sentMessages++;
            if (delivery.state.kind === "uncertain") impact.uncertainMessages++;
        }
    const newcomer = (source: typeof groups) => {
        const date = resolveDripSchedule({
            groups: source,
            accessibleGroupIds: [],
            anchorAt: nowUTC,
            now: nowUTC,
        }).dates[patch.groupId];
        return date == null
            ? null
            : new Date(Math.max(nowUTC, date)).toISOString();
    };
    impact.samples.push({
        label: "New member joining now",
        before: newcomer(course.groups),
        after: newcomer(groups),
    });
    // Dates generated from “joining now” move with the clock; the material audience
    // and due work are compared separately, and the whole review has a short expiry.
    const counts = { ...impact, samples: undefined };
    const effectsHash = fingerprint(
        plain({
            snapshots,
            periods: periods.map((period) => ({
                id: period.id,
                revision: period.revision,
                state: period.state,
                deliveries: period.deliveries,
            })),
            lessons: lessons.map((lesson) => ({
                id: lesson.lessonId,
                groupId: lesson.groupId,
                published: lesson.published,
                publication: lesson.publication,
            })),
            counts,
        }),
    );
    const preview: DripPreview = {
        before,
        after,
        impact,
        coursePublished: course.published,
        evaluatedAt: now.toISOString(),
        expiresAt: new Date(nowUTC + REVIEW_MS).toISOString(),
        effectsHash,
    };
    return {
        course,
        groups,
        preview,
        baseline: {
            revision: course.__v || 0,
            groups: plain(course.groups),
            fingerprint: scheduleFingerprint(course),
        },
    };
}
