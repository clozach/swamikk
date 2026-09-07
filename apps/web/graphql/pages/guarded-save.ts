import PageModel, { type Page } from "@/models/Page";
import {
    pageWriteFilter,
    pageRevision,
    pageMutableFields,
} from "@/services/content-changes/page-guard";
import type { EditablePage } from "@/services/content-changes/page-types";
import { requireCondition } from "@/services/content-changes/errors";

export function nativePageBaseline(page: Page) {
    const document = page as Page & { toObject?: () => EditablePage };
    return document.toObject ? document.toObject() : (page as EditablePage);
}
/** Every native page save shares the approved adapter's revision/fingerprint fence. */
export async function guardedNativePageSave(
    page: Page,
    baseline: EditablePage,
    publicationReceipt?: Page["publicationReceipt"],
) {
    const value = nativePageBaseline(page);
    const set = Object.fromEntries(
        pageMutableFields
            .filter((key) => value[key] !== undefined)
            .map((key) => [key, value[key]]),
    );
    const unset = Object.fromEntries(
        pageMutableFields
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
