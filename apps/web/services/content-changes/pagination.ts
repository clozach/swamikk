import { requireCondition } from "./errors";

/** Stable cursor includes the ID so equal timestamps cannot hide records. */
export function cursorFilter(cursor?: string | null) {
    if (!cursor) return {};
    let value: { at?: string; id?: string } = {};
    try {
        if (cursor.length <= 512)
            value = JSON.parse(
                Buffer.from(cursor, "base64url").toString("utf8"),
            );
    } catch {
        /* Validate below. */
    }
    requireCondition(
        typeof value?.at === "string" &&
            Number.isFinite(Date.parse(value.at)) &&
            typeof value?.id === "string" &&
            /^[a-zA-Z0-9_-]{1,128}$/.test(value.id),
        "bad_request",
        "Invalid page cursor.",
    );
    const date = new Date(value.at!);
    return {
        $or: [
            { createdAt: { $lt: date } },
            { createdAt: date, id: { $gt: value.id } },
        ],
    };
}

export function nextCursor(rows: { createdAt: string; id: string }[]) {
    const last = rows[rows.length - 1];
    return rows.length === 50 && last
        ? Buffer.from(
              JSON.stringify({ at: last.createdAt, id: last.id }),
          ).toString("base64url")
        : null;
}
