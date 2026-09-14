import type {
    PageTextLeaves,
    TextEdit,
    TextEditHistory,
    TextEditInput,
} from "@courselit/common-models";
import { textEditUi as copy } from "@config/strings";

export type EditOutcome =
    | { kind: "applied"; edit: TextEdit }
    | {
          kind: "stale";
          current: Array<{ path: string; value: unknown }>;
          message: string;
      }
    | { kind: "failed"; message: string };

/** Same-origin session requests; the server derives tenant and role. */
async function request(
    path: string,
    body?: unknown,
): Promise<{ status: number; body: any }> {
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
    return {
        status: response.status,
        body: await response.json().catch(() => null),
    };
}

export async function fetchLeaves(pageId: string): Promise<PageTextLeaves> {
    const { status, body } = await request(
        `/api/content-changes/text/leaves?${new URLSearchParams({ pageId })}`,
    );
    if (status !== 200 || !body)
        throw new Error(body?.error?.message || copy.failed);
    return body as PageTextLeaves;
}

export async function submitEdit(input: TextEditInput): Promise<EditOutcome> {
    const { status, body } = await request(
        "/api/content-changes/text/edit",
        input,
    );
    if (status === 200 && body?.kind === "applied")
        return { kind: "applied", edit: body.edit as TextEdit };
    if (status === 409 && Array.isArray(body?.current))
        return {
            kind: "stale",
            current: body.current,
            message: body.error?.message || copy.stale,
        };
    return { kind: "failed", message: body?.error?.message || copy.failed };
}

export async function fetchHistory(
    pageId: string,
    before?: string,
): Promise<TextEditHistory> {
    const { status, body } = await request(
        `/api/content-changes/text/history?${new URLSearchParams({
            pageId,
            ...(before ? { before } : {}),
        })}`,
    );
    if (status !== 200 || !body)
        throw new Error(body?.error?.message || copy.failed);
    return body as TextEditHistory;
}
