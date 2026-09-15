import type {
    MemberEdit,
    MemberEditActor,
    MemberEmailPending,
} from "@courselit/common-models";
import type { InternalMemberEdit } from "@courselit/orm-models";

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** The row as the panel sees it: never the code hash, salt, attempts or state. */
export function view(
    record: InternalMemberEdit,
    editor?: MemberEditActor,
): MemberEdit {
    return {
        editId: record.editId,
        subjectUserId: record.subjectUserId,
        editorUserId: record.editorUserId,
        ...(editor ? { editor } : {}),
        mimicId: record.mimicId,
        at: record.at,
        changes: plain(record.changes).map((change) => ({
            field: change.field,
            before: change.before,
            after: change.after,
        })),
        ...(record.undoOf ? { undoOf: record.undoOf } : {}),
        ...(record.emailEffects ? { emailEffects: record.emailEffects } : {}),
        ...(record.emailVerification
            ? { emailVerification: { kind: record.emailVerification.kind } }
            : {}),
    };
}

export function pendingView(record: InternalMemberEdit): MemberEmailPending {
    const change = record.changes.find((item) => item.field === "email");
    return {
        pendingId: record.editId,
        email: change?.after || "",
        expiresAt: (record.expiresAt || new Date(0)).toISOString(),
        ...(record.undoOf ? { undoOf: record.undoOf } : {}),
    };
}
