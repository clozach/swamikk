import { randomUUID } from "crypto";
import type {
    PageTextLeaves,
    PageTextWidgetLeaves,
    TextEdit,
    TextEditHistory,
    TextEditInput,
    TextEditResult,
    WidgetInstance,
} from "@courselit/common-models";
import type { InternalPageTextEdit } from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import PageModel from "@/models/Page";
import DomainModel from "@/models/Domain";
import { invalidateDomainCache } from "@/lib/domain-cache";
import {
    editablePage,
    requirePageEditor,
    selectedPageWidget,
} from "./page-adapter";
import { pageRevision, pageWriteFilter } from "./page-guard";
import { PageTextEditModel } from "./models";
import { ContentChangeError, requireCondition } from "./errors";
import { validateTextEdit } from "./text-safety";
import {
    richTextDocFor,
    setTextLeaf,
    validateReplacement,
    widgetTextLeaves,
} from "./text-leaves";
import type { EditablePage } from "./page-types";

const plain = <T>(value: T): T =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));

type SharedWidgets = Record<
    string,
    { name?: string; settings?: Record<string, unknown> } & Record<
        string,
        unknown
    >
>;

const sharedWidgetInstance = (
    name: string,
    shared: SharedWidgets[string] | undefined,
): WidgetInstance => ({
    widgetId: name,
    name,
    deleteable: false,
    shared: true,
    settings: (shared?.settings as Record<string, unknown>) || {},
});

async function freshDomain(ctx: GQLContext) {
    const domain = (await DomainModel.findById(ctx.subdomain._id).lean()) as
        | (Record<string, unknown> & {
              _id: unknown;
              name: string;
              __v?: number;
              sharedWidgets?: SharedWidgets;
              draftSharedWidgets?: SharedWidgets;
          })
        | null;
    requireCondition(domain, "not_found", "Site not found.", 404);
    return domain;
}

/** Every editable text leaf on a page, shared header/footer included. */
export async function pageTextLeaves(
    pageId: string,
    ctx: GQLContext,
): Promise<PageTextLeaves> {
    const page = await editablePage(pageId, ctx);
    const domain = await freshDomain(ctx);
    const widgets: PageTextWidgetLeaves[] = page.layout.map((widget) => {
        const instance = widget.shared
            ? sharedWidgetInstance(
                  widget.name,
                  domain.sharedWidgets?.[widget.name],
              )
            : widget;
        return {
            widgetId: widget.widgetId,
            name: widget.name,
            shared: !!widget.shared,
            leaves: widgetTextLeaves(instance),
        };
    });
    return { pageId: page.pageId, revision: pageRevision(page), widgets };
}

const view = (record: InternalPageTextEdit): TextEdit => ({
    editId: record.editId,
    target: plain(record.target),
    widgetName: record.widgetName,
    before: record.before,
    after: record.after,
    userId: record.userId,
    at: record.at,
    revision: record.revision,
    ...(record.undoOf ? { undoOf: record.undoOf } : {}),
});

/**
 * The replacement settings for one widget, or a stale result when the stored
 * leaf no longer reads `before`. Rich-text edits keep the document's
 * structure: only the addressed text node changes, and the existing safety
 * validation proves it.
 */
function replaceLeaf(
    widget: WidgetInstance,
    path: string,
    before: string,
    after: string,
):
    | { kind: "settings"; settings: Record<string, unknown> }
    | { kind: "stale"; current: string } {
    const leaf = widgetTextLeaves(widget).find((item) => item.path === path);
    requireCondition(
        leaf,
        "unsupported_target",
        "Choose a text field on the page.",
    );
    if (leaf.value !== before) return { kind: "stale", current: leaf.value };
    const settings = setTextLeaf(widget, path, after);
    const doc = richTextDocFor(widget.settings || {}, path);
    if (doc)
        validateTextEdit(
            doc.doc as never,
            richTextDocFor(settings, path)!.doc as never,
        );
    return { kind: "settings", settings };
}

const stale = (current: string): TextEditResult => ({
    kind: "stale",
    current,
    message:
        "This text changed elsewhere; the page now shows the current version.",
});

async function record(
    input: TextEditInput,
    widgetName: string,
    ctx: GQLContext,
) {
    await PageTextEditModel.init();
    return PageTextEditModel.create({
        domain: ctx.subdomain._id,
        editId: randomUUID(),
        pageId: input.target.pageId,
        target: input.target,
        widgetName,
        before: input.before,
        after: input.after,
        userId: ctx.user.userId,
        at: new Date().toISOString(),
        revision: 0,
        ...(input.undoOf ? { undoOf: input.undoOf } : {}),
        state: "applying",
    });
}

async function settleRecord(
    entry: InternalPageTextEdit & { _id: unknown },
    outcome:
        | { state: "applied"; revision: number }
        | { state: "failed"; reason: string },
) {
    await PageTextEditModel.updateOne(
        { _id: entry._id },
        outcome.state === "applied"
            ? { $set: { state: "applied", revision: outcome.revision } }
            : { $set: { state: "failed", failureReason: outcome.reason } },
    );
}

async function applyPageWidgetEdit(
    input: TextEditInput & { target: { kind: "page-widget-text" } },
    ctx: GQLContext,
): Promise<TextEditResult> {
    const { pageId, widgetId, path } = input.target;
    const page: EditablePage = await editablePage(pageId, ctx);
    const widget = selectedPageWidget(page, widgetId);
    const replaced = replaceLeaf(widget, path, input.before, input.after);
    if (replaced.kind === "stale") return stale(replaced.current);
    let draftLayout: WidgetInstance[] | undefined;
    if (page.draftLayout?.length) {
        const draft = page.draftLayout.find(
            (item) => item.widgetId === widgetId,
        );
        requireCondition(
            draft && !draft.shared && draft.name === widget.name,
            "draft_conflict",
            "An unpublished draft changes this block. Keep that draft and resolve it in the page builder before editing here.",
            409,
        );
        const draftReplaced = replaceLeaf(
            draft,
            path,
            input.before,
            input.after,
        );
        requireCondition(
            draftReplaced.kind === "settings",
            "draft_conflict",
            "An unpublished draft already changes this text. Publish or discard it in the page builder before editing here.",
            409,
        );
        draftLayout = page.draftLayout.map((item) =>
            item.widgetId === widgetId
                ? { ...item, settings: draftReplaced.settings }
                : item,
        );
    }
    const layout = page.layout.map((item) =>
        item.widgetId === widgetId
            ? { ...item, settings: replaced.settings }
            : item,
    );
    const entry = await record(input, widget.name, ctx);
    const saved = (await PageModel.findOneAndUpdate(
        pageWriteFilter(page),
        {
            $set: { layout, ...(draftLayout ? { draftLayout } : {}) },
            $inc: { __v: 1 },
        },
        { new: true, runValidators: true },
    ).lean()) as { __v?: number } | null;
    if (!saved) {
        await settleRecord(entry, {
            state: "failed",
            reason: "The page changed while saving.",
        });
        throw new ContentChangeError(
            "stale",
            "The page changed while saving. Reload and try again.",
            409,
        );
    }
    const revision = saved.__v || pageRevision(page) + 1;
    await settleRecord(entry, { state: "applied", revision });
    return { kind: "applied", edit: view({ ...entry.toObject(), revision }) };
}

async function applySharedWidgetEdit(
    input: TextEditInput & { target: { kind: "shared-widget-text" } },
    ctx: GQLContext,
): Promise<TextEditResult> {
    const { name, path } = input.target;
    // The page only records where the edit was made; it must exist on this site.
    await editablePage(input.target.pageId, ctx);
    const domain = await freshDomain(ctx);
    const current = domain.sharedWidgets?.[name];
    requireCondition(
        current,
        "not_found",
        "This shared block is not on the site.",
        404,
    );
    const widget = sharedWidgetInstance(name, current);
    const replaced = replaceLeaf(widget, path, input.before, input.after);
    if (replaced.kind === "stale") return stale(replaced.current);
    const sharedWidgets: SharedWidgets = {
        ...plain(domain.sharedWidgets),
        [name]: { ...plain(current), settings: replaced.settings },
    };
    let draftSharedWidgets: SharedWidgets | undefined;
    const draft = domain.draftSharedWidgets?.[name];
    if (draft) {
        const draftReplaced = replaceLeaf(
            sharedWidgetInstance(name, draft),
            path,
            input.before,
            input.after,
        );
        requireCondition(
            draftReplaced.kind === "settings",
            "draft_conflict",
            "An unpublished header or footer draft already changes this text. Publish or discard it in the page builder before editing here.",
            409,
        );
        draftSharedWidgets = {
            ...plain(domain.draftSharedWidgets),
            [name]: { ...plain(draft), settings: draftReplaced.settings },
        };
    }
    const entry = await record(input, name, ctx);
    const saved = (await DomainModel.findOneAndUpdate(
        {
            _id: domain._id,
            $expr: {
                $eq: [
                    { $literal: plain(domain.sharedWidgets) },
                    "$sharedWidgets",
                ],
            },
        },
        {
            $set: {
                sharedWidgets,
                ...(draftSharedWidgets ? { draftSharedWidgets } : {}),
            },
            $inc: { __v: 1 },
        },
        { new: true },
    ).lean()) as { __v?: number } | null;
    if (!saved) {
        await settleRecord(entry, {
            state: "failed",
            reason: "The site's shared blocks changed while saving.",
        });
        throw new ContentChangeError(
            "stale",
            "The header or footer changed while saving. Reload and try again.",
            409,
        );
    }
    invalidateDomainCache(domain.name);
    const revision = saved.__v || (domain.__v || 0) + 1;
    await settleRecord(entry, { state: "applied", revision });
    return { kind: "applied", edit: view({ ...entry.toObject(), revision }) };
}

/** One inline edit: validated, applied under the page/site revision guard, recorded either way. */
export async function applyTextEdit(
    input: TextEditInput,
    ctx: GQLContext,
): Promise<TextEditResult> {
    requirePageEditor(ctx);
    validateReplacement(input.after);
    requireCondition(
        input.before !== input.after,
        "no_change",
        "This text already reads that way.",
    );
    return input.target.kind === "page-widget-text"
        ? applyPageWidgetEdit(
              input as TextEditInput & { target: { kind: "page-widget-text" } },
              ctx,
          )
        : applySharedWidgetEdit(
              input as TextEditInput & {
                  target: { kind: "shared-widget-text" };
              },
              ctx,
          );
}

/** Applied edits on this page plus every site-wide (shared) edit, newest first. */
export async function textEditHistory(
    pageId: string,
    ctx: GQLContext,
    before?: string,
    limit = 50,
): Promise<TextEditHistory> {
    requirePageEditor(ctx);
    const rows = (await PageTextEditModel.find({
        domain: ctx.subdomain._id,
        state: "applied",
        $or: [{ pageId }, { "target.kind": "shared-widget-text" }],
        ...(before ? { at: { $lt: before } } : {}),
    })
        .sort({ at: -1, editId: 1 })
        .limit(limit + 1)
        .lean()) as unknown as InternalPageTextEdit[];
    const page = rows.slice(0, limit);
    return {
        edits: page.map(view),
        nextCursor: rows.length > limit ? page[page.length - 1].at : null,
    };
}
