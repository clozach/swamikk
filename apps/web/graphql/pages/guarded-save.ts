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
    const set = Object.fromEntries(
        changed
            .filter((key) => value[key] !== undefined)
            .map((key) => [key, value[key]]),
    );
    const unset = Object.fromEntries(
        changed
            .filter((key) => value[key] === undefined)
            .map((key) => [key, ""]),
    );
    const saved = await PageModel.findOneAndUpdate(
        pageWriteFilter(baseline),
        {
            $set: {
                ...set,
                ...(publicationReceipt ? { publicationReceipt } : {}),
            },
            ...(Object.keys(unset).length ? { $unset: unset } : {}),
            $inc: { __v: 1 },
        },
        { new: true, runValidators: true },
    );
    requireCondition(
        saved && pageRevision(saved) === pageRevision(baseline) + 1,
        "stale",
        "The page changed while saving. Refresh it; your earlier save did not overwrite the newer page.",
        409,
    );
    return saved;
}
