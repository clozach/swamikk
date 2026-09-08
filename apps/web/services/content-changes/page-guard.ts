import type { EditablePage } from "./page-types";
import { fingerprint } from "./stable";

export const pageMutableFields = [
    "layout",
    "draftLayout",
    "title",
    "draftTitle",
    "description",
    "draftDescription",
    "socialImage",
    "draftSocialImage",
    "robotsAllowed",
    "draftRobotsAllowed",
    "name",
    "type",
    "entityId",
    "creatorId",
    "deleted",
    "draftOnly",
    "deleteable",
] as const;
export const pageRevision = (page: EditablePage) => page.__v || 0;
export const pageFingerprint = (page: EditablePage) =>
    fingerprint(
        Object.fromEntries(
            pageMutableFields.map((key) => [
                key,
                JSON.parse(JSON.stringify(page[key] ?? null)),
            ]),
        ),
    );
export function pageWriteFilter(page: EditablePage) {
    return {
        domain: page.domain,
        pageId: page.pageId,
        _id: (page as EditablePage & { _id?: unknown })._id || page.id,
        $and: [
            pageRevision(page) === 0
                ? { $or: [{ __v: 0 }, { __v: { $exists: false } }] }
                : { __v: pageRevision(page) },
        ],
        // A path-first comparison lets Mongoose cast embedded arrays again,
        // adding widget defaults/IDs that are absent in legacy stored BSON.
        // Literal-first expressions preserve the complete captured value,
        // including nested IDs/order and absent versus explicit-null fields.
        $expr: {
            $and: pageMutableFields.map((key) =>
                Object.prototype.hasOwnProperty.call(page, key) &&
                page[key] !== undefined
                    ? { $eq: [{ $literal: page[key] }, `$${key}`] }
                    : { $eq: [{ $type: `$${key}` }, "missing"] },
            ),
        },
    };
}
