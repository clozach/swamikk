import type {
    PageTextLeaves,
    PageTextWidgetLeaves,
    TextChange,
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
import { stableJson } from "./stable";
import {
    assertLinkWordsKept,
    isRichTextDoc,
    richTextPlain,
    setRichTextNode,
    setTextLeaf,
    validateReplacement,
    widgetTextLeaves,
} from "./text-leaves";
import type { EditablePage } from "./page-types";
import {
    createTextRecord,
    recoverTextEditReceipts,
    settleTextRecord,
} from "./text-edit-records";

import { widgetImageLeaves, setImageLeaf } from "./image-registry";
import { imageEditSession, type ImageEditSession } from "./image-edit";

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

/** Editable text leaves and explicit image slots, shared header/footer included. */
export async function pageTextLeaves(
    pageId: string,
    ctx: GQLContext,
): Promise<PageTextLeaves> {
    requirePageEditor(ctx);
    await recoverTextEditReceipts(ctx);
    const page = await editablePage(pageId, ctx);
    const domain = await freshDomain(ctx);
    const widgets: PageTextWidgetLeaves[] = page.layout.map((widget) => {
        const instance = widget.shared
            ? sharedWidgetInstance(
                  widget.name,
                  own(domain.sharedWidgets, widget.name),
              )
            : widget;
        return {
            widgetId: widget.widgetId,
            name: widget.name,
            shared: !!widget.shared,
            leaves: widgetTextLeaves(instance),
            images: widgetImageLeaves(instance),
        };
    });
    return { pageId: page.pageId, revision: pageRevision(page), widgets };
}

/** History rows from the first increment carried one path with before/after at the top level. */
const rowChanges = (record: InternalPageTextEdit): TextChange[] => {
    if (Array.isArray(record.changes) && record.changes.length)
        return plain(record.changes);
    const legacy = record as unknown as {
        target?: { path?: string };
        before?: string;
        after?: string;
    };
    return legacy.target?.path
        ? [
              {
                  kind: "text",
                  path: legacy.target.path,
                  before: legacy.before || "",
                  after: legacy.after || "",
              },
          ]
        : [];
};
const rowTarget = (record: InternalPageTextEdit): TextEdit["target"] => {
    const target = plain(record.target) as TextEdit["target"] & {
        path?: string;
    };
    delete target.path;
    return target;
};
const view = (record: InternalPageTextEdit): TextEdit => ({
    editId: record.editId,
    target: rowTarget(record),
    widgetName: record.widgetName,
    changes: rowChanges(record),
    userId: record.userId,
    at: record.at,
    revision: record.revision,
    ...(record.undoOf ? { undoOf: record.undoOf } : {}),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
const own = <T>(map: Record<string, T> | undefined, key: string) =>
    map && Object.prototype.hasOwnProperty.call(map, key)
        ? map[key]
        : undefined;

/** The draft copy must accept the same changes; any refusal there is a draft conflict, not a caller error. */
function applyToDraft(widget: WidgetInstance, changes: TextChange[]) {
    let replaced: ReturnType<typeof applyChanges>;
    try {
        replaced = applyChanges(widget, changes);
    } catch (error) {
        if (error instanceof ContentChangeError && error.status !== 409)
            throw new ContentChangeError(
                "draft_conflict",
                "An unpublished draft already changes this text. Publish or discard it in the page builder before editing here.",
                409,
            );
        throw error;
    }
    requireCondition(
        replaced.kind === "settings",
        "draft_conflict",
        "An unpublished draft already changes this text. Publish or discard it in the page builder before editing here.",
        409,
    );
    return replaced.settings;
}

/**
 * The replacement settings for one widget after every change in the edit, or
 * a stale result naming each change whose stored value moved. Text leaves are
 * replaced as strings; a rich-text node is replaced whole and then proven by
 * the existing structure validation, so formatting can only be the formatting
 * the editor already allows and embedded material is retained verbatim.
 */
function applyChanges(
    widget: WidgetInstance,
    changes: TextChange[],
):
    | { kind: "settings"; settings: Record<string, unknown> }
    | { kind: "stale"; current: Array<{ path: string; value: unknown }> } {
    const leaves = widgetTextLeaves(widget);
    const images = widgetImageLeaves(widget);
    const stale: Array<{ path: string; value: unknown }> = [];
    for (const change of changes) {
        if (change.kind === "image") {
            const image = images.find((item) => item.path === change.path);
            requireCondition(
                image,
                "unsupported_target",
                "Choose an image on this page.",
            );
            if (stableJson(image.value) !== stableJson(change.before))
                stale.push({ path: change.path, value: image.value });
            continue;
        }
        const entry = leaves.find((item) => item.path === change.path);
        requireCondition(
            entry,
            "unsupported_target",
            "Choose a text field on the page.",
        );
        if (change.kind === "text") {
            requireCondition(
                entry.kind !== "rich-text-node",
                "bad_request",
                "A paragraph is replaced as a whole, not as a string.",
            );
            if (entry.value !== change.before)
                stale.push({ path: change.path, value: entry.value });
        } else {
            requireCondition(
                entry.kind === "rich-text-node",
                "bad_request",
                "Only a paragraph or heading can be replaced as a whole.",
            );
            if (stableJson(entry.node) !== stableJson(change.before))
                stale.push({ path: change.path, value: entry.node });
        }
    }
    if (stale.length) return { kind: "stale", current: stale };
    const original = (widget.settings || {}) as Record<string, unknown>;
    let settings = { ...original };
    for (const change of changes) {
        const working = { ...widget, settings };
        if (change.kind === "image") {
            settings = setImageLeaf(working, change.path, change.after);
        } else if (change.kind === "text") {
            requireCondition(
                !change.path.endsWith(".linkText") ||
                    !change.before.trim() ||
                    !!change.after.trim(),
                "link_changed",
                "Keep the linked words; removing the link itself needs the page builder.",
            );
            validateReplacement(change.after);
            settings = setTextLeaf(working, change.path, change.after);
        } else {
            requireCondition(
                isRecord(change.after) && Array.isArray(change.after.content),
                "bad_request",
                "Invalid paragraph.",
            );
            validateReplacement(richTextPlain(change.after));
            settings = setRichTextNode(working, change.path, change.after);
        }
    }
    assertLinkWordsKept(
        settings,
        changes.map((change) => change.path),
    );
    for (const key of Array.from(
        new Set(changes.map((change) => change.path.split(".")[0])),
    )) {
        const before = original[key] ?? settings[key];
        if (isRichTextDoc(before) && isRichTextDoc(settings[key]))
            validateTextEdit(before as never, settings[key] as never);
    }
    requireCondition(
        stableJson(original) !== stableJson(settings),
        "no_change",
        "This text already reads that way.",
    );
    return { kind: "settings", settings };
}

const stale = (
    current: Array<{ path: string; value: unknown }>,
): TextEditResult => ({
    kind: "stale",
    current,
    message:
        "This text changed elsewhere; the page now shows the current version.",
});

async function applyPageWidgetEdit(
    input: TextEditInput & { target: { kind: "page-widget-text" } },
    ctx: GQLContext,
    images: ImageEditSession,
): Promise<TextEditResult> {
    const { pageId, widgetId } = input.target;
    const page: EditablePage = await editablePage(pageId, ctx);
    const widget = selectedPageWidget(page, widgetId);
    const initial = applyChanges(widget, input.changes);
    if (initial.kind === "stale") return stale(initial.current);
    input = (await images.prepare(
        input,
        widget,
        String((page as EditablePage & { _id?: unknown })._id || page.id),
    )) as typeof input;
    const replaced = applyChanges(widget, input.changes);
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
        const draftSettings = applyToDraft(draft, input.changes);
        draftLayout = page.draftLayout.map((item) =>
            item.widgetId === widgetId
                ? { ...item, settings: draftSettings }
                : item,
        );
    }
    const layout = page.layout.map((item) =>
        item.widgetId === widgetId
            ? { ...item, settings: replaced.settings }
            : item,
    );
    const entry = await createTextRecord(
        input,
        widget.name,
        String((page as EditablePage & { _id?: unknown })._id || page.id),
        ctx,
    );
    const revision = pageRevision(page) + 1;
    // Text/settings were validated above. Preserve every stored block identity
    // instead of re-casting the complete layout through Mongoose.
    const saved = await PageModel.collection.updateOne(pageWriteFilter(page), {
        $set: {
            layout,
            ...(draftLayout ? { draftLayout } : {}),
            updatedAt: new Date(),
        },
        $inc: { __v: 1 },
        $addToSet: { pageTextEditReceipts: { editId: entry.editId, revision } },
    });
    if (saved.modifiedCount !== 1) {
        await settleTextRecord(entry, {
            state: "failed",
            reason: "The page changed while saving.",
        });
        throw new ContentChangeError(
            "stale",
            "The page changed while saving. Reload and try again.",
            409,
        );
    }
    await settleTextRecord(entry, { state: "applied", revision });
    return { kind: "applied", edit: view({ ...entry.toObject(), revision }) };
}

async function applySharedWidgetEdit(
    input: TextEditInput & { target: { kind: "shared-widget-text" } },
    ctx: GQLContext,
    images: ImageEditSession,
): Promise<TextEditResult> {
    const { name } = input.target;
    // The page only records where the edit was made; it must exist on this site.
    await editablePage(input.target.pageId, ctx);
    const domain = await freshDomain(ctx);
    const current = own(domain.sharedWidgets, name);
    requireCondition(
        current,
        "not_found",
        "This shared block is not on the site.",
        404,
    );
    const widget = sharedWidgetInstance(name, current);
    const initial = applyChanges(widget, input.changes);
    if (initial.kind === "stale") return stale(initial.current);
    input = (await images.prepare(
        input,
        widget,
        String(domain._id),
    )) as typeof input;
    const replaced = applyChanges(widget, input.changes);
    if (replaced.kind === "stale") return stale(replaced.current);
    const sharedWidgets: SharedWidgets = {
        ...domain.sharedWidgets,
        [name]: { ...current, settings: replaced.settings },
    };
    let draftSharedWidgets: SharedWidgets | undefined;
    const draft = own(domain.draftSharedWidgets, name);
    if (draft)
        draftSharedWidgets = {
            ...domain.draftSharedWidgets,
            [name]: {
                ...draft,
                settings: applyToDraft(
                    sharedWidgetInstance(name, draft),
                    input.changes,
                ),
            },
        };
    const entry = await createTextRecord(input, name, String(domain._id), ctx);
    const saved = (await DomainModel.findOneAndUpdate(
        {
            _id: domain._id,
            // Both maps are compared whole: a concurrent draft save loses nothing.
            $expr: {
                $and: [
                    {
                        $eq: [
                            { $literal: domain.sharedWidgets },
                            "$sharedWidgets",
                        ],
                    },
                    domain.draftSharedWidgets === undefined
                        ? { $eq: [{ $type: "$draftSharedWidgets" }, "missing"] }
                        : {
                              $eq: [
                                  {
                                      $literal: domain.draftSharedWidgets,
                                  },
                                  "$draftSharedWidgets",
                              ],
                          },
                ],
            },
        },
        [
            {
                $set: {
                    sharedWidgets: { $literal: sharedWidgets },
                    ...(draftSharedWidgets
                        ? {
                              draftSharedWidgets: {
                                  $literal: draftSharedWidgets,
                              },
                          }
                        : {}),
                    __v: { $add: [{ $ifNull: ["$__v", 0] }, 1] },
                },
            },
            {
                $set: {
                    // Compute the actual committed revision in this atomic write.
                    // Unrelated site writes remain compatible with the maps CAS.
                    pageTextEditReceipts: {
                        $concatArrays: [
                            { $ifNull: ["$pageTextEditReceipts", []] },
                            [
                                {
                                    editId: { $literal: entry.editId },
                                    revision: "$__v",
                                },
                            ],
                        ],
                    },
                },
            },
        ],
        { new: true },
    ).lean()) as { __v?: number } | null;
    if (!saved) {
        await settleTextRecord(entry, {
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
    await settleTextRecord(entry, { state: "applied", revision });
    return { kind: "applied", edit: view({ ...entry.toObject(), revision }) };
}

/** One inline edit — every change on one widget together — validated, then recorded and applied under the page/site revision guard. */
export async function applyTextEdit(
    input: TextEditInput,
    ctx: GQLContext,
): Promise<TextEditResult> {
    requirePageEditor(ctx);
    requireCondition(
        input.changes.length >= 1 && input.changes.length <= 8,
        "bad_request",
        "An edit changes between one and eight fields.",
    );
    requireCondition(
        new Set(input.changes.map((change) => change.path)).size ===
            input.changes.length,
        "bad_request",
        "Each field appears once in an edit.",
    );
    // One change inside another's node would clobber it; each path stands alone.
    requireCondition(
        !input.changes.some((change) =>
            input.changes.some(
                (other) =>
                    other !== change &&
                    other.path.startsWith(`${change.path}.`),
            ),
        ),
        "bad_request",
        "Each field in an edit must be separate from the others.",
    );
    requireCondition(
        input.changes.some(
            (change) => stableJson(change.before) !== stableJson(change.after),
        ),
        "no_change",
        "This text already reads that way.",
    );
    await recoverTextEditReceipts(ctx);
    const images = imageEditSession(ctx);
    let applied = false;
    try {
        const result =
            input.target.kind === "page-widget-text"
                ? await applyPageWidgetEdit(
                      input as TextEditInput & {
                          target: { kind: "page-widget-text" };
                      },
                      ctx,
                      images,
                  )
                : await applySharedWidgetEdit(
                      input as TextEditInput & {
                          target: { kind: "shared-widget-text" };
                      },
                      ctx,
                      images,
                  );
        applied = result.kind === "applied";
        return result;
    } finally {
        if (!applied) await images.abandon();
    }
}

/** Applied edits on this page plus every site-wide (shared) edit, newest first. */
export async function textEditHistory(
    pageId: string,
    ctx: GQLContext,
    before?: string,
    limit = 50,
): Promise<TextEditHistory> {
    requirePageEditor(ctx);
    await recoverTextEditReceipts(ctx);
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
