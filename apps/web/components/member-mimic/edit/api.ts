import type {
    MemberEdit,
    MemberEditField,
    MemberEditHistory,
    MemberEditInput,
    MemberEditSnapshot,
    MemberEmailInput,
    MemberEmailPending,
    MemberEmailResult,
} from "@courselit/common-models";
import { memberEditUi as copy } from "@config/strings";

/** What one edit request came back as; `failed` covers every non-contract answer. */
export type EditOutcome =
    | { kind: "applied"; edit: MemberEdit; snapshot: MemberEditSnapshot }
    | {
          kind: "stale";
          current: Array<{ field: MemberEditField; value: string }>;
          message: string;
      }
    | {
          kind: "verify";
          pending: MemberEmailPending;
          snapshot: MemberEditSnapshot;
      }
    | { kind: "failed"; message: string };

export type EmailOutcome =
    | MemberEmailResult
    | { kind: "failed"; message: string };

const EMAIL_KINDS: ReadonlySet<string> = new Set([
    "applied",
    "wrong-code",
    "expired",
    "cancelled",
    "resent",
]);

/** Same-origin session requests inside Member Mimic; the server takes editor and subject from the mimic cookie. */
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

/** GET /api/member-edits → `{ snapshot }`: the record as the database holds it now. */
export async function loadSnapshot(): Promise<MemberEditSnapshot> {
    const { status, body } = await request("/api/member-edits");
    if (status !== 200 || !body?.snapshot)
        throw new Error(body?.error?.message || copy.loadFailed);
    return body.snapshot as MemberEditSnapshot;
}

/** POST /api/member-edits; a 409 with `current` is the stale answer. */
export async function submitEdit(input: MemberEditInput): Promise<EditOutcome> {
    const { status, body } = await request("/api/member-edits", input);
    if (
        status === 200 &&
        body?.kind === "applied" &&
        body.edit &&
        body.snapshot
    )
        return {
            kind: "applied",
            edit: body.edit as MemberEdit,
            snapshot: body.snapshot as MemberEditSnapshot,
        };
    if (status === 200 && body?.kind === "verify" && body.pending)
        return {
            kind: "verify",
            pending: body.pending as MemberEmailPending,
            snapshot: body.snapshot as MemberEditSnapshot,
        };
    if (
        (status === 409 || body?.kind === "stale") &&
        Array.isArray(body?.current)
    )
        return {
            kind: "stale",
            current: body.current,
            message: body.error?.message || body.message || copy.stale,
        };
    return { kind: "failed", message: body?.error?.message || copy.failed };
}

/** POST /api/member-edits/email: confirm, resend or cancel a pending address change. */
export async function emailAction(
    input: MemberEmailInput,
): Promise<EmailOutcome> {
    const { body } = await request("/api/member-edits/email", input);
    if (body && typeof body.kind === "string" && EMAIL_KINDS.has(body.kind))
        return body as MemberEmailResult;
    return { kind: "failed", message: body?.error?.message || copy.failed };
}

/** GET /api/member-edits/history?before=<cursor>, newest first. */
export async function fetchHistory(
    before?: string,
): Promise<MemberEditHistory> {
    const { status, body } = await request(
        before
            ? `/api/member-edits/history?${new URLSearchParams({ before })}`
            : "/api/member-edits/history",
    );
    if (status !== 200 || !body)
        throw new Error(body?.error?.message || copy.failed);
    return body as MemberEditHistory;
}

/**
 * Whether the member has a refund request an admin still has to decide. The
 * edit snapshot carries no refund facts (a refund is its own record); the
 * mimic-readable refund list answers instead. Unreadable → no line shown.
 */
export async function fetchPendingRefund(): Promise<boolean> {
    try {
        const { status, body } = await request("/api/refund-requests");
        if (status !== 200 || !Array.isArray(body?.products)) return false;
        return body.products.some(
            (product: { request?: { state?: string } | null }) =>
                product.request &&
                (product.request.state === "submitted" ||
                    product.request.state === "review-required"),
        );
    } catch {
        return false;
    }
}
