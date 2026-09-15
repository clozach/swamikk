import { randomUUID } from "crypto";
import type { TextEditInput } from "@courselit/common-models";
import type {
    InternalPageTextEdit,
    PageTextEditReceipt,
} from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import PageModel from "@/models/Page";
import DomainModel from "@/models/Domain";
import { invalidateDomainCache } from "@/lib/domain-cache";
import { PageTextEditModel } from "./models";
import { requireCondition } from "./errors";

export async function createTextRecord(
    input: TextEditInput,
    widgetName: string,
    sourceDocumentId: string,
    ctx: GQLContext,
) {
    await PageTextEditModel.init();
    return PageTextEditModel.create({
        domain: ctx.subdomain._id,
        editId: randomUUID(),
        pageId: input.target.pageId,
        sourceDocumentId,
        target: input.target,
        widgetName,
        changes: input.changes,
        userId: ctx.user.userId,
        at: new Date().toISOString(),
        revision: 0,
        ...(input.undoOf ? { undoOf: input.undoOf } : {}),
        state: "applying",
    });
}

/** Settlement can race a recovery read. Applied history is never downgraded. */
export async function settleTextRecord(
    entry: InternalPageTextEdit,
    outcome:
        | { state: "applied"; revision: number }
        | { state: "failed"; reason: string },
) {
    const settled = await PageTextEditModel.updateOne(
        {
            domain: entry.domain,
            editId: entry.editId,
            sourceDocumentId: entry.sourceDocumentId,
            ...(outcome.state === "applied"
                ? {
                      $or: [
                          { state: "applying" },
                          { state: "applied", revision: outcome.revision },
                      ],
                  }
                : { state: "applying" }),
        },
        outcome.state === "applied"
            ? { $set: { state: "applied", revision: outcome.revision } }
            : { $set: { state: "failed", failureReason: outcome.reason } },
    );
    requireCondition(
        settled.matchedCount === 1,
        "unavailable",
        "The text edit's history could not be confirmed. Refresh its status before retrying.",
        503,
    );
    if (outcome.state !== "applied") return;
    // Clear only this edit's receipt, after its history is durably visible.
    const filter = { _id: entry.sourceDocumentId, domain: entry.domain };
    const update = {
        $pull: { pageTextEditReceipts: { editId: entry.editId } },
    };
    if (entry.target.kind === "page-widget-text")
        await PageModel.updateOne(filter, update, { timestamps: false });
    else
        await DomainModel.updateOne({ _id: entry.domain }, update, {
            timestamps: false,
        });
}

async function recoverReceipt(
    receipt: PageTextEditReceipt,
    sourceDocumentId: string,
    kind: TextEditInput["target"]["kind"],
    ctx: GQLContext,
) {
    const row = await PageTextEditModel.findOne({
        domain: ctx.subdomain._id,
        editId: receipt.editId,
        sourceDocumentId,
        "target.kind": kind,
    }).lean();
    requireCondition(
        row,
        "unavailable",
        "A saved text edit is awaiting its history record. Refresh before editing again.",
        503,
    );
    await settleTextRecord(row, {
        state: "applied",
        revision: receipt.revision,
    });
}

/** Recover only source-proven writes, including renamed/soft-deleted pages.
 * No field comparison can prove an old receiptless attempt ever committed. */
export async function recoverTextEditReceipts(ctx: GQLContext) {
    const pages = await PageModel.find({
        domain: ctx.subdomain._id,
        "pageTextEditReceipts.0": { $exists: true },
    })
        .select("_id pageTextEditReceipts")
        .lean();
    for (const page of pages)
        for (const receipt of page.pageTextEditReceipts || [])
            await recoverReceipt(
                receipt,
                String(page._id),
                "page-widget-text",
                ctx,
            );
    const domain = await DomainModel.findById(ctx.subdomain._id)
        .select("name pageTextEditReceipts")
        .lean();
    if (domain?.pageTextEditReceipts?.length) {
        // A lost source acknowledgment may also have skipped invalidation.
        invalidateDomainCache(domain.name);
        for (const receipt of domain.pageTextEditReceipts)
            await recoverReceipt(
                receipt,
                String(domain._id),
                "shared-widget-text",
                ctx,
            );
    }
}
