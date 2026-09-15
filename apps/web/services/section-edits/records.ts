import type { SectionEdit } from "@courselit/common-models";
import type { InternalSectionEdit } from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import PageModel from "@/models/Page";
import type { EditablePage } from "@/services/content-changes/page-types";
import { requireCondition } from "@/services/content-changes/errors";
import { SectionEditModel } from "./model";
import { clone } from "./layout";

export const documentId = (page: EditablePage) =>
    String((page as EditablePage & { _id?: unknown })._id || page.id);
export const view = (row: InternalSectionEdit): SectionEdit =>
    clone({
        editId: row.editId,
        target: row.target,
        action: row.action,
        widgetName: row.widgetName,
        label: row.label,
        widget: row.widget,
        position: row.position,
        userId: row.userId,
        at: row.at,
        revision: row.revision,
        ...(row.undoOf ? { undoOf: row.undoOf } : {}),
    });
export async function findRecord(
    editId: string,
    ctx: GQLContext,
): Promise<InternalSectionEdit | null> {
    return SectionEditModel.findOne({
        domain: ctx.subdomain._id,
        editId,
    }).lean<InternalSectionEdit>();
}

/** Receipt proves the page write. Mark durable history first, then clear only this receipt. */
export async function settleApplied(row: InternalSectionEdit) {
    await SectionEditModel.updateOne(
        { domain: row.domain, editId: row.editId },
        { $set: { state: { kind: "applied" } } },
    );
    await PageModel.updateOne(
        { _id: row.target.documentId, domain: row.domain },
        { $pull: { sectionEditReceipts: row.editId } },
    );
    return { ...row, state: { kind: "applied" as const } };
}

/** Read-side recovery handles a lost response or process exit after the atomic page write. */
export async function recoverPageReceipts(page: EditablePage) {
    const ids = page.sectionEditReceipts || [];
    if (!ids.length) return;
    const records = await SectionEditModel.find({
        domain: page.domain,
        "target.documentId": documentId(page),
        editId: { $in: ids },
    }).lean();
    for (const row of records) await settleApplied(row);
}

export async function requireAppliedRecord(editId: string, ctx: GQLContext) {
    let row = await findRecord(editId, ctx);
    requireCondition(
        row,
        "not_found",
        "Section edit not found on this site.",
        404,
    );
    if (row.state.kind === "applying") {
        const receipt = await PageModel.exists({
            _id: row.target.documentId,
            domain: ctx.subdomain._id,
            sectionEditReceipts: row.editId,
        });
        if (receipt) row = await settleApplied(row);
        else row = (await findRecord(editId, ctx)) || row;
    }
    requireCondition(
        row.state.kind === "applied",
        "unsettled",
        "This action has not finished. Retry it before reversing it.",
        409,
    );
    return row;
}
