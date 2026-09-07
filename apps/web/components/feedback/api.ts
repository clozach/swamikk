import { feedbackUi as copy } from "@config/strings";

/** Same-origin session requests; the server derives tenant and role. */
export async function feedbackRequest<T>(
    path: string,
    body?: unknown,
): Promise<T> {
    const response = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers:
            body === undefined
                ? undefined
                : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) {
        throw new Error(result?.error?.message || copy.actionFailed);
    }
    return result as T;
}

export async function allFeedbackPages<T>(
    path: string,
    key: "feedback" | "changes",
): Promise<T[]> {
    const items: T[] = [];
    let cursor: string | null = null;
    do {
        const result: { nextCursor: string | null } & Record<string, unknown> =
            await feedbackRequest(
                `${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
            );
        items.push(...(result[key] as T[]));
        cursor = result.nextCursor;
    } while (cursor);
    return items;
}
