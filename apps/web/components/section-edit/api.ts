import type {
    PageSections,
    SectionEdit,
    SectionEditInput,
} from "@courselit/common-models";
import { sectionEditUi as copy } from "@config/strings";

export type SectionOutcome =
    | { kind: "applied"; edit: SectionEdit }
    | { kind: "stale" | "failed" | "uncertain"; message: string };
export interface SectionHistoryPage {
    edits: SectionEdit[];
    nextCursor: string | null;
}

async function read(path: string) {
    const response = await fetch(path, {
        credentials: "same-origin",
        cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || copy.failed);
    return body;
}
export const fetchSections = (pageId: string): Promise<PageSections> =>
    read(`/api/section-edits?${new URLSearchParams({ pageId })}`);
export const fetchSectionHistory = (
    pageId: string,
    before?: string,
): Promise<SectionHistoryPage> =>
    read(
        `/api/section-edits/history?${new URLSearchParams({ pageId, ...(before ? { before } : {}) })}`,
    );

/** One request identity survives a lost response, so a retry cannot remove twice. */
export async function submitSectionEdit(
    input: SectionEditInput,
): Promise<SectionOutcome> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const response = await fetch("/api/section-edits", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            });
            const body = await response.json();
            if (response.ok && body?.kind === "applied")
                return { kind: "applied", edit: body.edit };
            if (response.status >= 500) continue;
            return {
                kind: response.status === 409 ? "stale" : "failed",
                message: body?.error?.message || copy.failed,
            };
        } catch {
            // The server retains the request receipt, including a response lost in transit.
        }
    }
    return { kind: "uncertain", message: copy.uncertain };
}
