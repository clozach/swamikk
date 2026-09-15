import type {
    PageSections,
    SectionEditHistory,
} from "@courselit/common-models";
import type GQLContext from "@/models/GQLContext";
import { editablePage } from "@/services/content-changes/page-adapter";
import { pageRevision } from "@/services/content-changes/page-guard";
import { requireCondition } from "@/services/content-changes/errors";
import { SectionEditModel } from "./model";
import { removable, sectionLabel, widgetFingerprint } from "./layout";
import { documentId, recoverPageReceipts, view } from "./records";
import { latestRemovals } from "./ordering";

/** Page body controls plus recoverable absences; a reused route never inherits old controls. */
export async function pageSections(
    pageId: string,
    ctx: GQLContext,
): Promise<PageSections> {
    const page = await editablePage(pageId, ctx);
    requireCondition(
        !page.draftOnly,
        "unsupported_target",
        "Choose a published page.",
    );
    await recoverPageReceipts(page);
    const nativeId = documentId(page);
    const latest = await latestRemovals(page);
    return {
        pageId,
        documentId: nativeId,
        revision: pageRevision(page),
        sections: page.layout.flatMap((widget, index) =>
            removable(widget)
                ? [
                      {
                          widgetId: widget.widgetId,
                          widgetName: widget.name,
                          label: sectionLabel(widget),
                          fingerprint: widgetFingerprint(widget),
                          index,
                      },
                  ]
                : [],
        ),
        removed: latest
            .sort(
                (a, b) =>
                    a.position.index - b.position.index ||
                    a.editId.localeCompare(b.editId),
            )
            .map(view),
    };
}

function decodeCursor(cursor?: string): { at: string; id: string } | undefined {
    if (!cursor) return;
    let value: { at?: string; id?: string } = {};
    try {
        value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    } catch {
        /* Check below. */
    }
    requireCondition(
        typeof value?.at === "string" &&
            Number.isFinite(Date.parse(value.at)) &&
            typeof value?.id === "string" &&
            /^[a-zA-Z0-9_-]{1,128}$/.test(value.id),
        "bad_request",
        "Invalid history cursor.",
    );
    return { at: value.at!, id: value.id! };
}

export async function sectionEditHistory(
    pageId: string,
    ctx: GQLContext,
    before?: string,
    limit = 50,
): Promise<SectionEditHistory> {
    const page = await editablePage(pageId, ctx);
    await recoverPageReceipts(page);
    const cursor = decodeCursor(before);
    const size = Math.min(50, Math.max(1, limit));
    const rows = await SectionEditModel.find({
        domain: ctx.subdomain._id,
        "target.documentId": documentId(page),
        "state.kind": "applied",
        ...(cursor
            ? {
                  $or: [
                      { at: { $lt: cursor.at } },
                      { at: cursor.at, editId: { $gt: cursor.id } },
                  ],
              }
            : {}),
    })
        .sort({ at: -1, editId: 1 })
        .limit(size + 1)
        .lean();
    const entries = rows.slice(0, size);
    const last = entries[entries.length - 1];
    return {
        edits: entries.map(view),
        nextCursor:
            rows.length > size
                ? Buffer.from(
                      JSON.stringify({ at: last.at, id: last.editId }),
                  ).toString("base64url")
                : null,
    };
}
