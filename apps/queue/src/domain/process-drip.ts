import { resolveDripSchedule } from "../../../../packages/common-logic/src/drip-schedule";
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

/** Compatibility entry point; administrator review uses the identical pure resolver. */
export function getNewAccessibleGroupIdsForPurchase({
    course,
    userProgressInCourse,
    nowUTC,
}: {
    course: InternalCourse;
    userProgressInCourse: UserPurchase;
    nowUTC: number;
}): string[] {
    const rawAnchor =
        userProgressInCourse.lastDripAt || userProgressInCourse.createdAt;
    return resolveDripSchedule({
        groups: course.groups || [],
        accessibleGroupIds: userProgressInCourse.accessibleGroups || [],
        anchorAt: rawAnchor ? new Date(rawAnchor).getTime() : undefined,
        now: nowUTC,
    }).dueGroupIds;
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
    const currentCourse = (await CourseModel.findOne({
        domain: course.domain,
        courseId: course.courseId,
        published: true,
    }).lean()) as InternalCourse | null;
    if (!currentCourse) return;
    course = currentCourse;
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
            (group) =>
                group.drip?.email?.published === true &&
                group.drip.email.content &&
                group.drip.email.subject,
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
            (course as InternalCourse & { __v?: number }).__v || 0,
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
        if (!email?.content || !email.subject || email.published !== true)
            continue;
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
