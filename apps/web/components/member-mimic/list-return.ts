import type { UserFilterWithAggregator } from "@courselit/common-models";

/** Restore only bounded table controls; this grants no member permission. */
export function readMemberListReturn(search: string) {
    const query = new URLSearchParams(search);
    const value = Number(query.get("page"));
    const page =
        Number.isSafeInteger(value) && value > 0 && value <= 100_000
            ? value
            : 1;
    let filter: UserFilterWithAggregator = { aggregator: "or", filters: [] };
    try {
        const raw = query.get("filters");
        const parsed = raw && raw.length <= 1024 ? JSON.parse(raw) : null;
        if (
            parsed &&
            ["or", "and"].includes(parsed.aggregator) &&
            Array.isArray(parsed.filters) &&
            parsed.filters.length <= 20 &&
            parsed.filters.every(
                (item: Record<string, unknown>) =>
                    item &&
                    typeof item.name === "string" &&
                    typeof item.condition === "string" &&
                    typeof item.value === "string",
            )
        )
            filter = parsed;
    } catch {
        /* An invalid copied URL opens the unfiltered list. */
    }
    return { page, filter, search: (query.get("search") || "").slice(0, 200) };
}
