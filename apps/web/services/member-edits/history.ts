import type {
    MemberEditActor,
    MemberEditHistory,
} from "@courselit/common-models";
import type { InternalMemberEdit } from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import UserModel from "@/models/User";
import { requireCondition } from "@/services/content-changes/errors";
import { requireMimicEditor } from "./context";
import { MemberEditModel } from "./model";
import { view } from "./view";

export const HISTORY_PAGE = 50;

/**
 * The same tie-broken cursor shape as content changes (`{at, id}`, base64url),
 * keyed on the row's `at` and `editId` so equal timestamps cannot hide rows.
 */
function decodeCursor(cursor?: string) {
    if (!cursor) return undefined;
    let value: { at?: string; id?: string } = {};
    try {
        if (cursor.length <= 512)
            value = JSON.parse(
                Buffer.from(cursor, "base64url").toString("utf8"),
            );
    } catch {
        /* Validate below. */
    }
    requireCondition(
        typeof value?.at === "string" &&
            Number.isFinite(Date.parse(value.at)) &&
            typeof value?.id === "string" &&
            /^[a-zA-Z0-9_-]{1,128}$/.test(value.id),
        "bad_request",
        "Invalid page cursor.",
    );
    return { at: value.at as string, id: value.id as string };
}

const encodeCursor = (row: InternalMemberEdit) =>
    Buffer.from(JSON.stringify({ at: row.at, id: row.editId })).toString(
        "base64url",
    );

/** Applied edits of the member, newest first; editors resolved at read time, never stored. */
export async function listMemberEdits(
    headers: Headers,
    ctx: GQLContext,
    options: { before?: string; limit?: number } = {},
): Promise<MemberEditHistory> {
    const editor = await requireMimicEditor(headers, ctx);
    const limit = Math.min(
        Math.max(options.limit ?? HISTORY_PAGE, 1),
        HISTORY_PAGE,
    );
    const cursor = decodeCursor(options.before);
    const rows = (await MemberEditModel.find({
        domain: editor.domain._id,
        subjectUserId: editor.subject.userId,
        state: "applied",
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
        .limit(limit + 1)
        .lean()) as unknown as InternalMemberEdit[];
    const page = rows.slice(0, limit);
    const editorIds = Array.from(new Set(page.map((row) => row.editorUserId)));
    const users = editorIds.length
        ? ((await UserModel.find(
              { domain: editor.domain._id, userId: { $in: editorIds } },
              { userId: 1, name: 1, email: 1, _id: 0 },
          ).lean()) as unknown as {
              userId: string;
              name?: string;
              email: string;
          }[])
        : [];
    const editors = new Map<string, MemberEditActor>(
        users.map((user) => [
            user.userId,
            { userId: user.userId, name: user.name || "", email: user.email },
        ]),
    );
    return {
        edits: page.map((row) => view(row, editors.get(row.editorUserId))),
        nextCursor:
            rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
    };
}
