import PageModel, { type Page } from "@/models/Page";
import {
    pageWriteFilter,
    pageRevision,
    pageMutableFields,
} from "@/services/content-changes/page-guard";
import type { EditablePage } from "@/services/content-changes/page-types";
import { requireCondition } from "@/services/content-changes/errors";
import { BSON } from "mongodb";
import { isDeepStrictEqual } from "util";

export function nativePageBaseline(page: Page) {
    const document = page as Page & { toObject?: () => EditablePage };
    // The native writer reads lean/raw data. Snapshot it before changing the
    // working object; JSON/structuredClone would change BSON identity types.
    const value = document.toObject ? document.toObject() : page;
    return BSON.deserialize(
        BSON.serialize(value, { ignoreUndefined: true }),
    ) as EditablePage;
}

/** Existing values keep their stored BSON. Genuinely changed/new values keep
 * the schema's casting/default behavior, including inputs from the builder. */
async function validateChanges(
    value: EditablePage,
    baseline: EditablePage,
    changed: ReadonlyArray<(typeof pageMutableFields)[number]>,
) {
    const validation = nativePageBaseline(value as Page);
    const stored = [...baseline.layout, ...(baseline.draftLayout || [])];
    for (const key of ["layout", "draftLayout"] as const) {
        validation[key] = validation[key]?.map((widget) => {
            const copy = { ...widget };
            if (
                stored.some(
                    (original) =>
                        original.widgetId === widget.widgetId &&
                        isDeepStrictEqual(original["_id"], widget["_id"]),
                )
            )
                delete copy["_id"];
            return copy;
        });
    }
    const document = new PageModel(validation);
    for (const key of changed)
        if (value[key] === undefined) document.set(key, undefined);
    await document.validate([...changed]);
    const validated = document.toObject();
    for (const key of ["layout", "draftLayout"] as const) {
        if (!changed.includes(key) || !value[key]) continue;
        validated[key] = value[key].map((widget, index) => {
            const previous = stored.filter(
                (original) => original.widgetId === widget.widgetId,
            );
            const cast = validated[key][index];
            // Keep unchanged unknown metadata and legacy/missing identities;
            // new fields still use the schema result (or are stripped).
            for (const field of Array.from(
                new Set([...Object.keys(widget), ...Object.keys(cast)]),
            )) {
                if (
                    previous.some(
                        (original) =>
                            Object.prototype.hasOwnProperty.call(
                                original,
                                field,
                            ) ===
                                Object.prototype.hasOwnProperty.call(
                                    widget,
                                    field,
                                ) &&
                            isDeepStrictEqual(original[field], widget[field]),
                    )
                ) {
                    if (Object.prototype.hasOwnProperty.call(widget, field))
                        cast[field] = widget[field];
                    else delete cast[field];
                }
            }
            return cast;
        });
    }
    return validated;
}
/** Every native page save shares the approved adapter's revision/fingerprint fence. */
export async function guardedNativePageSave(
    page: Page,
    baseline: EditablePage,
    publicationReceipt?: Page["publicationReceipt"],
) {
    const value = nativePageBaseline(page);
    const changed = pageMutableFields.filter(
        (key) =>
            (value[key] === undefined) !== (baseline[key] === undefined) ||
            !isDeepStrictEqual(
                BSON.serialize(
                    { value: value[key] },
                    { ignoreUndefined: true },
                ),
                BSON.serialize(
                    { value: baseline[key] },
                    { ignoreUndefined: true },
                ),
            ),
    );
    const validated = await validateChanges(value, baseline, changed);
    const set = Object.fromEntries(
        changed
            .filter((key) => value[key] !== undefined)
            .map((key) => [key, validated[key]]),
    );
    const unset = Object.fromEntries(
        changed
            .filter((key) => value[key] === undefined)
            .map((key) => [key, ""]),
    );
    const saved = (await PageModel.collection.findOneAndUpdate(
        pageWriteFilter(baseline),
        {
            $set: {
                ...set,
                ...(publicationReceipt ? { publicationReceipt } : {}),
                updatedAt: new Date(),
            },
            ...(Object.keys(unset).length ? { $unset: unset } : {}),
            $inc: { __v: 1 },
        },
        { returnDocument: "after", includeResultMetadata: false },
    )) as unknown as EditablePage | null;
    requireCondition(
        saved && pageRevision(saved) === pageRevision(baseline) + 1,
        "stale",
        "The page changed while saving. Refresh it; your earlier save did not overwrite the newer page.",
        409,
    );
    return saved;
}
