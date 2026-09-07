import type {
    DripChangePatch,
    ReleaseRule,
    DripSectionView,
} from "../../../../packages/common-models/src/drip-change";
import { scheduleGroupId } from "../../../../packages/common-logic/src/drip-schedule";
import { renderEmailToHtml } from "@courselit/email-editor";
import type { InternalLesson } from "@courselit/orm-models";
import { requireCondition } from "../content-changes/errors";
import { plain, type ScheduleCourse } from "./guard";

export type NativeGroup = ScheduleCourse["groups"][number];
export function releaseRule(group: NativeGroup): ReleaseRule {
    if (!group.drip?.status) return { kind: "available" };
    if (
        group.drip.type === "exact-date" &&
        Number.isFinite(group.drip.dateInUTC) &&
        Math.abs(group.drip.dateInUTC!) <= 8640000000000000
    )
        return {
            kind: "exact",
            at: new Date(group.drip.dateInUTC!).toISOString(),
        };
    if (
        group.drip.type === "relative-date" &&
        Number.isFinite(group.drip.delayInMillis) &&
        group.drip.delayInMillis! >= 0
    )
        return { kind: "relative", delayInMillis: group.drip.delayInMillis! };
    return { kind: "unknown" };
}
export function applySchedulePatch(
    course: ScheduleCourse,
    patch: DripChangePatch,
): NativeGroup[] {
    const ids = course.groups.map(scheduleGroupId);
    requireCondition(
        ids.includes(patch.groupId) &&
            patch.groupOrder.length === ids.length &&
            new Set(patch.groupOrder).size === ids.length &&
            patch.groupOrder.every((id) => ids.includes(id)),
        "invalid_order",
        "Review the current section list before changing its order.",
    );
    const groups = plain(course.groups);
    const group = groups.find(
        (item) => scheduleGroupId(item) === patch.groupId,
    )!;
    requireCondition(
        !patch.notificationEnabled ||
            !!(group.drip?.email?.subject && group.drip.email.content),
        "missing_message",
        "Prepare a release message before enabling its notification.",
    );
    const previous = group.drip || {
        status: false,
        type: "relative-date" as const,
    };
    group.drip = { ...previous, status: patch.rule.kind !== "available" };
    if (patch.rule.kind === "exact") {
        group.drip.type = "exact-date";
        group.drip.dateInUTC = new Date(patch.rule.at).getTime();
        delete group.drip.delayInMillis;
    } else if (patch.rule.kind === "relative") {
        group.drip.type = "relative-date";
        group.drip.delayInMillis = patch.rule.delayInMillis;
        delete group.drip.dateInUTC;
    }
    if (group.drip.email)
        group.drip.email.published = patch.notificationEnabled;
    return patch.groupOrder.map((id, index) => ({
        ...groups.find((item) => scheduleGroupId(item) === id)!,
        rank: (index + 1) * 1000,
    }));
}

export async function sectionViews(
    groups: NativeGroup[],
    lessons: InternalLesson[],
): Promise<DripSectionView[]> {
    return Promise.all(
        [...groups]
            .sort((a, b) => a.rank - b.rank)
            .map(async (group) => {
                const id = scheduleGroupId(group);
                const children = lessons.filter(
                    (lesson) => lesson.groupId === id,
                );
                const email = group.drip?.email;
                let html = "";
                if (email?.content && email.subject) {
                    try {
                        html = await renderEmailToHtml({
                            email: email.content,
                        });
                    } catch {
                        /* Invalid legacy messages remain visibly unavailable for approval. */
                    }
                }
                return {
                    id,
                    name: group.name,
                    rule: releaseRule(group),
                    publishedLessons: children.filter(
                        (lesson) => lesson.published,
                    ).length,
                    draftLessons: children.filter((lesson) => !lesson.published)
                        .length,
                    unknownPublicationDates: children.filter(
                        (lesson) =>
                            lesson.published &&
                            lesson.publication?.kind !== "known",
                    ).length,
                    notification:
                        email?.content && email.subject
                            ? {
                                  enabled: email.published === true,
                                  subject: email.subject,
                                  html,
                              }
                            : null,
                };
            }),
    );
}
