import { scheduleGroupId, type ScheduledGroup } from "./drip-schedule";

/** Only release-affecting settings; lesson order/content and mail are excluded. */
export function releaseSettingsSignature(course: {
    published?: boolean;
    groups?: ScheduledGroup[];
}): string {
    return JSON.stringify({
        published: !!course.published,
        groups: [...(course.groups || [])]
            .sort((a, b) => (a.rank || 0) - (b.rank || 0))
            .map((group) => ({
                id: scheduleGroupId(group),
                rule: !group.drip?.status
                    ? { available: true }
                    : {
                          type: group.drip.type,
                          ...(group.drip.type === "exact-date"
                              ? { dateInUTC: group.drip.dateInUTC ?? null }
                              : {
                                    delayInMillis:
                                        group.drip.delayInMillis ?? null,
                                }),
                      },
            })),
    });
}
