import CourseModel from "./model/course";
import UserModel from "./model/user";
import { Liquid } from "liquidjs";
import { getDomain, getMemberships } from "./queries";
import { Constants } from "@courselit/common-models";
import { ensureMembershipAccess } from "../../../../packages/common-logic/src/member-access/lifecycle";
import {
    recordDripRelease,
    getPendingDripDeliveries,
    projectDripAccess,
} from "../../../../packages/common-logic/src/member-access/drip";
import {
    InternalCourse,
    InternalMembership,
    InternalUser,
} from "@courselit/orm-models";
import { getEmailFrom } from "@courselit/utils";
import { renderEmailToHtml } from "@courselit/email-editor";
import { getSiteUrl } from "../utils/get-site-url";
import { getUnsubLink } from "../utils/get-unsub-link";
import { captureError, getDomainId } from "../observability/posthog";
import { addMailJob } from "./handler";
import { logInfo } from "@/observability/logs";
const liquidEngine = new Liquid();

type CourseGroup = InternalCourse["groups"][number];
type UserPurchase = InternalUser["purchases"][number];

function toGroupId(group: CourseGroup): string | undefined {
    const value = (group as { _id?: unknown; id?: unknown })._id ?? group.id;
    if (value === null || value === undefined) {
        return undefined;
    }

    return String(value);
}

function getSortedGroups(groups: CourseGroup[] = []): CourseGroup[] {
    return [...groups].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
}

/**
 * Answers: given this course, this user’s progress, and current time, which section
 * group IDs should be newly unlocked right now?
 */
export function getNewAccessibleGroupIdsForPurchase({
    course,
    userProgressInCourse,
    nowUTC,
}: {
    course: InternalCourse;
    userProgressInCourse: UserPurchase;
    nowUTC: number;
}): string[] {
    const accessibleGroups = Array.isArray(
        userProgressInCourse.accessibleGroups,
    )
        ? userProgressInCourse.accessibleGroups
        : [];
    const sortedGroups = getSortedGroups(course.groups ?? []);

    const exactDateAccessibleGroupIds = sortedGroups
        .filter((group) => {
            const releaseDateInUTC = group.drip?.dateInUTC;
            return (
                group.drip?.status &&
                group.drip.type === "exact-date" &&
                typeof releaseDateInUTC === "number" &&
                nowUTC >= releaseDateInUTC
            );
        })
        .map(toGroupId)
        .filter((id): id is string => Boolean(id));

    const progressAnchor = userProgressInCourse.lastDripAt
        ? new Date(userProgressInCourse.lastDripAt)
        : userProgressInCourse.createdAt
          ? new Date(userProgressInCourse.createdAt)
          : null;
    if (!progressAnchor) {
        return exactDateAccessibleGroupIds.filter(
            (id) => !accessibleGroups.includes(id),
        );
    }

    const anchorInUTC = progressAnchor.getTime();
    if (Number.isNaN(anchorInUTC)) {
        return exactDateAccessibleGroupIds.filter(
            (id) => !accessibleGroups.includes(id),
        );
    }

    const relativeAccessibleGroupIds: string[] = [];
    let releaseCursorUTC = anchorInUTC;
    for (const group of sortedGroups) {
        if (
            !group.drip?.status ||
            group.drip.type !== "relative-date" ||
            !Number.isFinite(group.drip.delayInMillis)
        ) {
            continue;
        }

        const groupId = toGroupId(group);
        if (!groupId || accessibleGroups.includes(groupId)) {
            continue;
        }

        const delayInMillis = group.drip.delayInMillis as number;
        if (delayInMillis < 0) {
            break;
        }

        const unlockAtUTC = releaseCursorUTC + delayInMillis;
        if (nowUTC >= unlockAtUTC) {
            relativeAccessibleGroupIds.push(groupId);
            releaseCursorUTC = unlockAtUTC;
            continue;
        }

        // Relative drips are sequential by section order.
        break;
    }

    const allAccessibleGroupIds = new Set([
        ...exactDateAccessibleGroupIds,
        ...relativeAccessibleGroupIds,
    ]);
    return Array.from(allAccessibleGroupIds).filter(
        (id) => !accessibleGroups.includes(id),
    );
}

/** One pass is separately callable for recovery and cancellation-boundary tests. */
export async function processDripPass(now = new Date()) {
    const courses = (await CourseModel.find({
        "groups.drip": { $exists: true },
        published: true,
    }).lean()) as unknown as InternalCourse[];
    for (const course of courses) {
        try {
            await processCourseDrip(course, now);
        } catch (error) {
            captureError({
                error,
                source: "processDrip.course",
                domainId: getDomainId(course.domain),
                context: { course_id: course.courseId },
            });
        }
    }
}

async function processCourseDrip(course: InternalCourse, now: Date) {
    const memberships = await getMemberships(
        course.courseId,
        Constants.MembershipEntityType.COURSE,
        course.domain,
    );
    for (const membership of memberships) {
        try {
            await processMembershipDrip(course, membership, now);
        } catch (error) {
            captureError({
                error,
                source: "processDrip.membership",
                domainId: getDomainId(course.domain),
                context: {
                    course_id: course.courseId,
                    membership_id: membership.membershipId,
                },
            });
        }
    }
}

async function processMembershipDrip(
    course: InternalCourse,
    membership: InternalMembership,
    now: Date,
) {
    const domainId = String(course.domain);
    const user = (await UserModel.findOne({
        domain: course.domain,
        userId: membership.userId,
        active: true,
    }).lean()) as unknown as InternalUser | null;
    if (!user) return;
    const period = await ensureMembershipAccess({ domainId, membership });
    if (period.state.kind !== "active") return;
    const originalPurchase = user.purchases.find(
        (purchase) => purchase.courseId === course.courseId,
    );
    const scheduledPurchase = {
        accessibleGroups: period.groupReleases.map(
            (release) => release.groupId,
        ),
        createdAt:
            period.start.kind === "recorded"
                ? period.start.at
                : originalPurchase?.createdAt,
        lastDripAt: period.lastRelativeReleaseAt,
    } as UserPurchase;
    const groupIds = getNewAccessibleGroupIdsForPurchase({
        course,
        userProgressInCourse: scheduledPurchase,
        nowUTC: now.getTime(),
    });
    const relativeIds = course.groups
        .filter(
            (group) =>
                group.drip?.status && group.drip.type === "relative-date",
        )
        .map(toGroupId)
        .filter((id): id is string => Boolean(id));
    const emailIds = course.groups
        .filter(
            (group) => group.drip?.email?.content && group.drip?.email?.subject,
        )
        .map(toGroupId)
        .filter((id): id is string => Boolean(id));
    if (groupIds.length) {
        const committed = await recordDripRelease(
            period,
            groupIds,
            relativeIds,
            emailIds,
            now,
            period.revision,
        );
        if (!committed) return;
        logInfo(
            `${groupIds.length} Sections unlocked for ${user.email} in course ${course.title}`,
            {
                source: "processDrip.unlock",
                domainId,
                course_id: course.courseId,
                user_id: user.userId,
                unlocked_group_ids: groupIds.join(","),
            },
        );
    }
    // Recover the compatibility cache and outbox even after a grant-only crash.
    await projectDripAccess(period);
    const pending = await getPendingDripDeliveries(domainId, period.id);
    if (!pending.length) return;
    const [domain, creator] = await Promise.all([
        getDomain(course.domain),
        UserModel.findOne({
            domain: course.domain,
            userId: course.creatorId,
        }).lean(),
    ]);
    if (!domain) return;
    const templatePayload = {
        subscriber: { email: user.email, name: user.name, tags: user.tags },
        product: {
            title: course.title,
            url: `${getSiteUrl(domain)}/course/${course.slug}/${course.courseId}`,
        },
        address: domain.settings.mailingAddress,
        unsubscribe_link: getUnsubLink(domain, user.unsubscribeToken),
    };
    for (const delivery of pending) {
        const group = course.groups.find(
            (candidate) => toGroupId(candidate) === delivery.groupId,
        );
        const email = group?.drip?.email;
        if (!email?.content || !email.subject) continue;
        const content = await liquidEngine.parseAndRender(
            await renderEmailToHtml({ email: email.content }),
            templatePayload,
        );
        await addMailJob({
            to: [user.email],
            subject: email.subject,
            body: content,
            from: getEmailFrom({
                name: creator?.name || creator?.email || "",
                email: process.env.EMAIL_FROM || "",
            }),
            domainId,
            drip: { periodId: period.id, deliveryId: delivery.id },
        });
    }
}

export async function processDrip() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            await processDripPass();
        } catch (error) {
            captureError({
                error,
                source: "processDrip.loop",
                domainId: getDomainId(),
            });
        }
        await new Promise((resolve) => setTimeout(resolve, 60 * 1000));
    }
}
