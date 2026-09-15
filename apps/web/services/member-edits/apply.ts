import type {
    MemberEditChange,
    MemberEditField,
    MemberEditResult,
} from "@courselit/common-models";
import type { InternalMemberEdit } from "@courselit/orm-models";
import type GQLContext from "@/models/GQLContext";
import UserModel from "@/models/User";
import { requireCondition } from "@/services/content-changes/errors";
import { ContactPreferencesModel } from "@/services/contact-preferences/model";
import {
    type MimicEditor,
    refreshSubject,
    requireMimicEditor,
} from "./context";
import { proposeEmailChange } from "./email";
import { MemberEditModel } from "./model";
import {
    failStale,
    recordEdit,
    STALE_MESSAGE,
    staleChanges,
    withEditorReservation,
} from "./rows";
import {
    type MemberRecordValues,
    readMemberEditSnapshot,
    readMemberRecordValues,
} from "./snapshot";
import { assertResultingRecord, parseMemberEditInput } from "./validate";
import { view } from "./view";
import { settleAppliedEdit } from "./recovery";

/** A reversal names an applied row of this same member, or nothing. */
export async function resolveUndoOf(
    editor: MimicEditor,
    undoOf?: string,
): Promise<InternalMemberEdit | undefined> {
    if (!undoOf) return undefined;
    const row = await MemberEditModel.findOne({
        domain: editor.domain._id,
        editId: undoOf,
        subjectUserId: editor.subject.userId,
        state: "applied",
    }).lean();
    requireCondition(
        row,
        "not_found",
        "That edit is not in this member's history.",
        404,
    );
    return row as unknown as InternalMemberEdit;
}

/**
 * The user document by `_id` plus `$expr` equality on the edited field's
 * current value, with `timestamps: false` so *Last active* is not disturbed.
 * A member without a name holds null or nothing; both read as "".
 */
async function writeName(
    editor: MimicEditor,
    expected: string,
    next: string,
    editId: string,
) {
    return UserModel.findOneAndUpdate(
        {
            _id: editor.subject._id,
            domain: editor.domain._id,
            $expr: {
                $eq: [{ $literal: expected }, { $ifNull: ["$name", ""] }],
            },
        },
        { $set: { name: next }, $addToSet: { memberEditReceipts: editId } },
        { new: true, timestamps: false, runValidators: true },
    );
}

/** The same revision compare-and-swap the member's own preferences save uses, upserting only at revision 0. */
async function writeContact(
    editor: MimicEditor,
    current: MemberRecordValues,
    after: (field: MemberEditField) => string,
    editId: string,
) {
    try {
        return await ContactPreferencesModel.findOneAndUpdate(
            {
                domain: editor.domain._id,
                userId: editor.subject.userId,
                revision: current.revision,
                state: "active",
            },
            {
                $set: {
                    contact: {
                        kind: after("contact.kind"),
                        value: after("contact.value"),
                    },
                    checkIns: after("checkIns"),
                    updatedAt: new Date(),
                },
                $inc: { revision: 1 },
                $addToSet: { memberEditReceipts: editId },
            },
            {
                new: true,
                upsert: current.revision === 0,
                runValidators: true,
            },
        );
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        return null;
    }
}

export async function applyMemberEdit(
    headers: Headers,
    ctx: GQLContext,
    raw: unknown,
): Promise<MemberEditResult> {
    const editor = await requireMimicEditor(headers, ctx);
    const input = parseMemberEditInput(raw);
    const restored = await resolveUndoOf(editor, input.undoOf);
    if (restored)
        requireCondition(
            input.changes.length === restored.changes.length &&
                input.changes.every((change) =>
                    restored.changes.some(
                        (original) =>
                            original.field === change.field &&
                            original.before === change.after,
                    ),
                ),
            "bad_request",
            "A restoration must use the recorded previous values.",
        );
    const current = await readMemberRecordValues(editor);
    const stale = staleChanges(current, input.changes);
    if (stale.length)
        return { kind: "stale", current: stale, message: STALE_MESSAGE };
    requireCondition(
        input.changes.some((change) => change.after !== change.before),
        "no_change",
        "This record already reads that way.",
    );
    assertResultingRecord(current, input.changes, restored?.changes);
    if (input.changes.some((change) => change.field === "email"))
        return proposeEmailChange(editor, headers, input);

    const nameChange = input.changes.find((change) => change.field === "name");
    const contactChanges = input.changes.filter(
        (change) => change.field !== "name",
    );
    const after = (field: MemberEditField) =>
        input.changes.find((change: MemberEditChange) => change.field === field)
            ?.after ?? current[field];
    const entry = await withEditorReservation(editor, async () => {
        const entry = await recordEdit(editor, input, "applying");
        if (nameChange) {
            const saved = await writeName(
                editor,
                current.name,
                nameChange.after,
                entry.editId,
            );
            if (!saved)
                await failStale(
                    entry,
                    "The member's record changed while saving.",
                );
        }
        if (contactChanges.length) {
            const saved = await writeContact(
                editor,
                current,
                after,
                entry.editId,
            );
            if (!saved) {
                await failStale(
                    entry,
                    "The member's contact preferences changed while saving.",
                );
            }
        }
        await settleAppliedEdit(editor, entry, headers);
        return entry;
    });
    return {
        kind: "applied",
        edit: view(entry.toObject()),
        snapshot: await readMemberEditSnapshot(await refreshSubject(editor)),
    };
}
