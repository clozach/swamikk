/** Pure native schedule calculation shared by the worker and administrator review. */
export interface ScheduledGroup {
    id?: unknown;
    _id?: unknown;
    rank?: number;
    drip?: {
        status?: boolean;
        type?: string;
        dateInUTC?: number | null;
        delayInMillis?: number | null;
    };
}

export function scheduleGroupId(group: ScheduledGroup): string {
    return String(group._id ?? group.id ?? "");
}

export function resolveDripSchedule({
    groups,
    accessibleGroupIds,
    anchorAt,
    now,
}: {
    groups: ScheduledGroup[];
    accessibleGroupIds: string[];
    anchorAt?: number;
    now: number;
}): { dueGroupIds: string[]; dates: Record<string, number | null> } {
    const sorted = [...groups].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    const dates: Record<string, number | null> = {};
    const exactDue: string[] = [];
    const relativeDue: string[] = [];
    let cursor = Number.isFinite(anchorAt) ? anchorAt! : null;
    for (const group of sorted) {
        const id = scheduleGroupId(group);
        if (!id || accessibleGroupIds.includes(id)) continue;
        if (!group.drip?.status) {
            dates[id] = now;
            continue;
        }
        if (group.drip.type === "exact-date") {
            const date = group.drip.dateInUTC;
            dates[id] =
                typeof date === "number" &&
                Number.isFinite(date) &&
                Math.abs(date) <= 8640000000000000
                    ? date
                    : null;
            if (dates[id] !== null && now >= dates[id]!) exactDue.push(id);
            continue;
        }
        if (group.drip.type !== "relative-date") {
            dates[id] = null;
            continue;
        }
        const delay = group.drip.delayInMillis;
        // Unknown legacy anchors and malformed delays are never invented.
        if (typeof delay !== "number" || !Number.isFinite(delay)) {
            dates[id] = null;
            continue;
        }
        if (cursor === null || delay < 0) {
            dates[id] = null;
            cursor = null;
            continue;
        }
        cursor += delay;
        if (Math.abs(cursor) > 8640000000000000) {
            dates[id] = null;
            cursor = null;
            continue;
        }
        dates[id] = cursor;
        if (now >= cursor) relativeDue.push(id);
    }
    return {
        dueGroupIds: Array.from(new Set([...exactDue, ...relativeDue])),
        dates,
    };
}
