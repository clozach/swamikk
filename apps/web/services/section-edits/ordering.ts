import type { SectionSnapshot, WidgetInstance } from "@courselit/common-models";
import type { InternalSectionEdit } from "@courselit/orm-models";
import type { EditablePage } from "@/services/content-changes/page-types";
import { ContentChangeError } from "@/services/content-changes/errors";
import { SectionEditModel } from "./model";
import { documentId } from "./records";
import { insertSection } from "./layout";

export async function latestRemovals(
    page: EditablePage,
): Promise<InternalSectionEdit[]> {
    const rows = await SectionEditModel.aggregate([
        {
            $match: {
                domain: page.domain,
                "target.documentId": documentId(page),
                "state.kind": "applied",
            },
        },
        { $sort: { revision: -1, editId: 1 } },
        { $group: { _id: "$target.widgetId", edit: { $first: "$$ROOT" } } },
    ]);
    const present = new Set(page.layout.map((widget) => widget.widgetId));
    return rows
        .map((item) => item.edit)
        .filter(
            (row) =>
                row.action === "remove" && !present.has(row.target.widgetId),
        );
}

function includeAbsent(
    layout: WidgetInstance[],
    rows: InternalSectionEdit[],
    draft: boolean,
) {
    let virtual = [...layout];
    // Earlier retained orders contain more historical relationships. Repeated
    // passes let an isolated section gain an anchor from a neighboring removal.
    const pending = [...rows].sort((a, b) => a.revision - b.revision);
    for (let pass = 0; pass < rows.length && pending.length; pass++) {
        for (let i = pending.length - 1; i >= 0; i--) {
            const part = draft
                ? pending[i].snapshot.draft
                : pending[i].snapshot.published;
            if (!("widget" in part)) {
                pending.splice(i, 1);
                continue;
            }
            if (
                virtual.some(
                    (widget) => widget.widgetId === part.widget.widgetId,
                )
            ) {
                pending.splice(i, 1);
                continue;
            }
            try {
                virtual = insertSection(virtual, part);
                pending.splice(i, 1);
            } catch (error) {
                if (
                    !(error instanceof ContentChangeError) ||
                    error.code !== "order_conflict"
                )
                    throw error;
                // A previous removal whose anchors were deliberately reordered
                // stays conflicted; it does not move the current page's blocks.
            }
        }
    }
    return virtual.map((widget) => widget.widgetId);
}

/** Preserve relative order across remove A/remove B and restoration in either order. */
export async function retainAbsentNeighbors(
    page: EditablePage,
    snapshot: SectionSnapshot,
): Promise<SectionSnapshot> {
    const removed = await latestRemovals(page);
    if (!removed.length) return snapshot;
    return {
        published: {
            ...snapshot.published,
            order: includeAbsent(page.layout, removed, false),
        },
        draft:
            snapshot.draft.kind === "absent"
                ? snapshot.draft
                : {
                      ...snapshot.draft,
                      order: includeAbsent(
                          page.draftLayout || [],
                          removed,
                          true,
                      ),
                  },
    };
}
