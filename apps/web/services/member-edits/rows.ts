import { randomUUID } from "crypto";
import type {
    MemberEditChange,
    MemberEditInput,
    MemberEditState,
    MemberEmailVerification,
} from "@courselit/common-models";
import type { InternalMemberEdit } from "@courselit/orm-models";
import type { HydratedDocument } from "mongoose";
import { ContentChangeError } from "@/services/content-changes/errors";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import type { MimicEditor } from "./context";
import { MemberEditModel } from "./model";
import type { MemberRecordValues } from "./snapshot";

export const STALE_MESSAGE =
    "This member's record changed elsewhere; the panel now shows the current values.";
export const CHANGED_WHILE_SAVING =
    "This member's record changed while saving. Reload and try again.";

/** Every change whose `before` is no longer what the record holds. */
export function staleChanges(
    current: MemberRecordValues,
    changes: MemberEditChange[],
) {
    return changes
        .filter((change) => change.before !== current[change.field])
        .map((change) => ({
            field: change.field,
            value: current[change.field],
        }));
}

export type MemberEditRow = HydratedDocument<InternalMemberEdit>;

/** The row is written before the record: every attempt leaves a trace. */
export async function recordEdit(
    editor: MimicEditor,
    input: MemberEditInput,
    state: Extract<MemberEditState, "applying" | "pending">,
    extra: Partial<InternalMemberEdit> = {},
) {
    await MemberEditModel.init();
    return MemberEditModel.create({
        domain: editor.domain._id,
        editId: randomUUID(),
        subjectUserId: editor.subject.userId,
        editorUserId: editor.actor.userId,
        mimicId: editor.mimic.id,
        at: new Date().toISOString(),
        changes: input.changes,
        ...(input.undoOf ? { undoOf: input.undoOf } : {}),
        state,
        ...extra,
    });
}

/** Compare the prior state, so stale requests cannot turn an applied edit into a failure. */
export async function settleEdit(
    entry: MemberEditRow,
    outcome:
        | { state: "applied"; emailVerification?: MemberEmailVerification }
        | { state: "failed"; reason: string },
) {
    const settled = await MemberEditModel.updateOne(
        { _id: entry._id, state: entry.state },
        outcome.state === "applied"
            ? {
                  $set: {
                      state: "applied",
                      ...(outcome.emailVerification
                          ? { emailVerification: outcome.emailVerification }
                          : {}),
                  },
              }
            : { $set: { state: "failed", failureReason: outcome.reason } },
    );
    if (settled.matchedCount !== 1) {
        const current = await MemberEditModel.findById(entry._id).lean();
        if (current?.state !== outcome.state)
            throw new ContentChangeError(
                "unsettled",
                "This edit changed while finishing. Reload and try again.",
                409,
            );
    }
    // Keep the hydrated row consistent for the response and later transitions.
    entry.state = outcome.state;
}

export async function failStale(
    entry: MemberEditRow,
    reason: string,
): Promise<never> {
    await settleEdit(entry, { state: "failed", reason });
    throw new ContentChangeError("stale", CHANGED_WHILE_SAVING, 409);
}

/**
 * The record write runs inside the account-lifecycle reservation for the
 * subject, nested under one for the actor, so an edit cannot race an
 * account closure on either side.
 */
export function withEditorReservation<T>(
    editor: MimicEditor,
    operation: () => Promise<T>,
): Promise<T> {
    const domainId = String(editor.domain._id);
    return withAccountWrite(
        { domainId, userId: editor.actor.userId, purpose: "support-editor" },
        () =>
            withAccountWrite(
                {
                    domainId,
                    userId: editor.subject.userId,
                    purpose: "support-member-edit",
                },
                operation,
            ),
    );
}
