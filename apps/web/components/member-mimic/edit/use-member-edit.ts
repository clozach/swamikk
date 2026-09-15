"use client";

import {
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
    MEMBER_EDIT_FIELDS,
    type MemberEdit,
    type MemberEditChange,
    type MemberEditField,
    type MemberEditInput,
    type MemberEditSnapshot,
    type MemberEmailPending,
} from "@courselit/common-models";
import { memberEditUi as copy } from "@config/strings";
import {
    emailAction,
    fetchPendingRefund,
    loadSnapshot,
    submitEdit,
    type EditOutcome,
} from "./api";

/** The panel's rows; the contact row saves its two stored fields as one edit. */
export type MemberEditRow = "name" | "email" | "contact" | "checkIns";

export const ROW_OF: Record<MemberEditField, MemberEditRow> = {
    name: "name",
    email: "email",
    "contact.kind": "contact",
    "contact.value": "contact",
    checkIns: "checkIns",
};

export type Load =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "failed"; message: string }
    | { kind: "ready" };

/** What has been typed but not saved, per stored field; absent means "the record's value". */
export type Drafts = Partial<Record<MemberEditField, string>>;

/** What the last act did, shown at the row it happened on until the next act. */
export interface RowStatus {
    row: MemberEditRow;
    text: string;
}

export type Notice = { text: string; sticky: boolean } | null;

/** An email change waiting for its six-digit code. */
export interface VerifyStep {
    pending: MemberEmailPending;
    code: string;
    attemptsLeft: number | null;
    /** The wrong-code line, shown under the code box until the next try. */
    error: string | null;
}

/** The stored value of one field, as the snapshot holds it. */
export const valueOf = (
    snapshot: MemberEditSnapshot,
    field: MemberEditField,
): string => {
    switch (field) {
        case "name":
            return snapshot.subject.name;
        case "email":
            return snapshot.subject.email;
        case "contact.kind":
            return snapshot.contact.kind;
        case "contact.value":
            return snapshot.contact.value;
        case "checkIns":
            return snapshot.contact.checkIns;
    }
};

/** The snapshot with some fields replaced — what a stale answer reports as current. */
export const withValues = (
    snapshot: MemberEditSnapshot,
    values: Array<{ field: MemberEditField; value: string }>,
): MemberEditSnapshot => {
    const next: MemberEditSnapshot = {
        ...snapshot,
        subject: { ...snapshot.subject },
        contact: { ...snapshot.contact },
    };
    for (const { field, value } of values) {
        if (field === "name") next.subject.name = value;
        else if (field === "email") next.subject.email = value;
        else if (field === "contact.kind")
            next.contact.kind = value as MemberEditSnapshot["contact"]["kind"];
        else if (field === "contact.value") next.contact.value = value;
        else
            next.contact.checkIns =
                value as MemberEditSnapshot["contact"]["checkIns"];
    }
    return next;
};

/** Every change reversed: what an undo, a redo or a restore sends. */
export const reversed = (changes: MemberEditChange[]): MemberEditChange[] =>
    changes.map((change) => ({
        field: change.field,
        before: change.after,
        after: change.before,
    }));

/** A typed value as it will be compared and sent: trimmed; an address lower-cased. */
export const normalized = (field: MemberEditField, value: string) =>
    field === "email"
        ? value.trim().toLowerCase()
        : field === "contact.kind" || field === "checkIns"
          ? value
          : value.trim();

const FIELDS_OF: Record<MemberEditRow, MemberEditField[]> = {
    name: ["name"],
    email: ["email"],
    contact: ["contact.kind", "contact.value"],
    checkIns: ["checkIns"],
};

type Move = "do" | "undo" | "redo" | "restore";
const STATUS_TEXT: Record<Move, string> = {
    do: copy.saved,
    undo: copy.undone,
    redo: copy.redone,
    restore: copy.restored,
};

/**
 * The member edit panel's state: the record as the server last confirmed it,
 * per-field drafts that outlive the panel being hidden, and the same
 * undo / redo / restore protocol as text edit mode — every reversal is a
 * fresh edit that names the row it reverses.
 */
export function useMemberEdit({ onApplied }: { onApplied?: () => void }) {
    // Null outside the app router (tests); a refresh is then a no-op.
    const router = useContext(AppRouterContext);
    const [load, setLoad] = useState<Load>({ kind: "idle" });
    const [snapshot, setSnapshot] = useState<MemberEditSnapshot | null>(null);
    const [drafts, setDrafts] = useState<Drafts>({});
    const [status, setStatus] = useState<RowStatus | null>(null);
    const [notice, setNoticeState] = useState<Notice>(null);
    const [verifyStep, setVerifyStep] = useState<VerifyStep | null>(null);
    const [pendingRefund, setPendingRefund] = useState(false);
    const [undoStack, setUndoStack] = useState<MemberEdit[]>([]);
    const [redoStack, setRedoStack] = useState<MemberEdit[]>([]);
    const [busy, setBusyState] = useState(false);
    // Event handlers read the latest state through refs, synced right after each commit.
    const snapshotRef = useRef(snapshot);
    const draftsRef = useRef(drafts);
    const verifyRef = useRef(verifyStep);
    const stacksRef = useRef({ undo: undoStack, redo: redoStack });
    useLayoutEffect(() => {
        snapshotRef.current = snapshot;
        draftsRef.current = drafts;
        verifyRef.current = verifyStep;
        stacksRef.current = { undo: undoStack, redo: redoStack };
    }, [snapshot, drafts, verifyStep, undoStack, redoStack]);
    const busyRef = useRef(false);
    const onAppliedRef = useRef(onApplied);
    onAppliedRef.current = onApplied;

    const setBusy = useCallback((value: boolean) => {
        busyRef.current = value;
        setBusyState(value);
    }, []);
    const setNotice = useCallback((text: string, sticky = false) => {
        setNoticeState(text ? { text, sticky } : null);
    }, []);
    useEffect(() => {
        if (!notice || notice.sticky) return;
        const timer = window.setTimeout(() => setNoticeState(null), 4000);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const reload = useCallback(async () => {
        setLoad({ kind: "loading" });
        try {
            const [next, refund] = await Promise.all([
                loadSnapshot(),
                fetchPendingRefund(),
            ]);
            setSnapshot(next);
            setPendingRefund(refund);
            setVerifyStep(
                next.pendingEmail
                    ? {
                          pending: next.pendingEmail,
                          code: "",
                          attemptsLeft: null,
                          error: null,
                      }
                    : null,
            );
            setLoad({ kind: "ready" });
        } catch (error) {
            setLoad({
                kind: "failed",
                message:
                    error instanceof Error ? error.message : copy.loadFailed,
            });
        }
    }, []);

    const setDraft = useCallback((field: MemberEditField, value: string) => {
        setDrafts((current) => ({ ...current, [field]: value }));
    }, []);
    const clearDrafts = useCallback(
        (fields: MemberEditField[], applied?: MemberEditChange[]) => {
            setDrafts((current) => {
                const next = { ...current };
                for (const field of fields) {
                    const saved = applied?.find(
                        (change) => change.field === field,
                    );
                    if (
                        saved &&
                        current[field] !== undefined &&
                        normalized(field, current[field]!) !==
                            normalized(field, saved.after)
                    )
                        continue;
                    delete next[field];
                }
                return next;
            });
        },
        [],
    );

    /** What a row's control shows: the draft when there is one, else the record. */
    const shown = useCallback(
        (field: MemberEditField) =>
            drafts[field] ?? (snapshot ? valueOf(snapshot, field) : ""),
        [drafts, snapshot],
    );

    /** Fields whose draft differs from the record — what closing would lose. */
    const dirtyFields = MEMBER_EDIT_FIELDS.filter(
        (field) =>
            snapshot !== null &&
            drafts[field] !== undefined &&
            normalized(field, drafts[field]!) !==
                normalized(field, valueOf(snapshot, field)),
    );
    const dirtyRef = useRef(dirtyFields);
    dirtyRef.current = dirtyFields;

    /** Record one answer from the server; the applied edit, when there is one. */
    const settle = useCallback(
        (
            outcome: EditOutcome,
            row: MemberEditRow,
            text: string,
        ): MemberEdit | null => {
            if (outcome.kind === "applied") {
                setSnapshot(outcome.snapshot);
                clearDrafts(
                    outcome.edit.changes.map((change) => change.field),
                    outcome.edit.changes,
                );
                setVerifyStep((current) =>
                    outcome.snapshot.pendingEmail
                        ? current?.pending.pendingId ===
                          outcome.snapshot.pendingEmail.pendingId
                            ? current
                            : {
                                  pending: outcome.snapshot.pendingEmail,
                                  code: "",
                                  attemptsLeft: null,
                                  error: null,
                              }
                        : null,
                );
                setStatus({ row, text });
                onAppliedRef.current?.();
                router?.refresh();
                return outcome.edit;
            }
            if (outcome.kind === "stale") {
                setSnapshot((current) =>
                    current ? withValues(current, outcome.current) : current,
                );
                clearDrafts(outcome.current.map((item) => item.field));
                setNotice(outcome.message, true);
                router?.refresh();
                return null;
            }
            if (outcome.kind === "verify") {
                setSnapshot(outcome.snapshot);
                setVerifyStep({
                    pending: outcome.pending,
                    code: "",
                    attemptsLeft: null,
                    error: null,
                });
                setStatus(null);
                return null;
            }
            setNotice(outcome.message, true);
            return null;
        },
        [clearDrafts, router, setNotice],
    );

    /** Post one edit; every save, undo, redo and restore goes through here. */
    const post = useCallback(
        async (input: MemberEditInput, row: MemberEditRow, text: string) => {
            if (busyRef.current) return null;
            setBusy(true);
            try {
                return settle(await submitEdit(input), row, text);
            } catch (error) {
                setNotice(
                    error instanceof Error ? error.message : copy.failed,
                    true,
                );
                return null;
            } finally {
                setBusy(false);
            }
        },
        [setBusy, setNotice, settle],
    );

    /** Save a row: its changed fields together, each `before` the record's value now. */
    const save = useCallback(
        async (row: MemberEditRow) => {
            const current = snapshotRef.current;
            if (!current || busyRef.current) return null;
            const changes: MemberEditChange[] = [];
            for (const field of FIELDS_OF[row]) {
                const draft = draftsRef.current[field];
                if (draft === undefined) continue;
                const before = valueOf(current, field);
                const after = normalized(field, draft);
                if (after === normalized(field, before)) continue;
                changes.push({ field, before, after });
            }
            if (!changes.length) {
                setNotice(copy.unchanged);
                return null;
            }
            const edit = await post({ changes }, row, STATUS_TEXT.do);
            if (edit) {
                setUndoStack((stack) => [...stack, edit]);
                setRedoStack([]);
            }
            return edit;
        },
        [post, setNotice],
    );

    /** Post the reversal of a recorded edit; the reversal is itself recorded. */
    const reverse = useCallback(
        (edit: MemberEdit, move: Move, changes = reversed(edit.changes)) =>
            post(
                { changes, undoOf: edit.editId },
                ROW_OF[changes[0].field],
                STATUS_TEXT[move],
            ),
        [post],
    );

    const undo = useCallback(async () => {
        const stack = stacksRef.current.undo;
        const last = stack[stack.length - 1];
        if (!last || busyRef.current) return;
        const reversal = await reverse(last, "undo");
        if (reversal) {
            setUndoStack((items) => items.filter((item) => item !== last));
            setRedoStack((items) => [...items, reversal]);
        }
    }, [reverse]);

    const redo = useCallback(async () => {
        const stack = stacksRef.current.redo;
        const last = stack[stack.length - 1];
        if (!last || busyRef.current) return;
        const reversal = await reverse(last, "redo");
        if (reversal) {
            setRedoStack((items) => items.filter((item) => item !== last));
            setUndoStack((items) => [...items, reversal]);
        }
    }, [reverse]);

    /** Restore a history row's red text against whatever the record holds now. */
    const restore = useCallback(
        async (edit: MemberEdit) => {
            const current = snapshotRef.current;
            if (!current || busyRef.current) return null;
            const changes: MemberEditChange[] = [];
            for (const change of edit.changes) {
                const now = valueOf(current, change.field);
                changes.push({
                    field: change.field,
                    before: now,
                    after: change.before,
                });
            }
            if (!changes.some((change) => change.before !== change.after)) {
                setNotice(copy.unchanged);
                return null;
            }
            const reversal = await reverse(edit, "restore", changes);
            if (reversal) {
                setUndoStack((items) => [...items, reversal]);
                setRedoStack([]);
            }
            return reversal;
        },
        [reverse, setNotice],
    );

    const setCode = useCallback((code: string) => {
        setVerifyStep((step) =>
            step
                ? { ...step, code: code.replace(/\D/g, "").slice(0, 6) }
                : step,
        );
    }, []);

    /** The second step of an email change: the code the new address received. */
    const confirmCode = useCallback(async () => {
        const step = verifyRef.current;
        if (!step || busyRef.current || step.code.length !== 6) return;
        setBusy(true);
        setStatus(null);
        try {
            const result = await emailAction({
                action: "confirm",
                pendingId: step.pending.pendingId,
                code: step.code,
            });
            if (result.kind === "applied") {
                setSnapshot(result.snapshot);
                clearDrafts(
                    result.edit.changes.map((change) => change.field),
                    result.edit.changes,
                );
                setVerifyStep(null);
                setStatus({ row: "email", text: copy.emailChanged });
                setUndoStack((items) => [...items, result.edit]);
                setRedoStack([]);
                onAppliedRef.current?.();
                router?.refresh();
            } else if (result.kind === "wrong-code") {
                setVerifyStep((current) =>
                    current
                        ? {
                              ...current,
                              code: "",
                              attemptsLeft: result.attemptsLeft,
                              error: copy.wrongCode.replace(
                                  "{n}",
                                  String(result.attemptsLeft),
                              ),
                          }
                        : current,
                );
            } else if (result.kind === "expired") {
                setSnapshot(result.snapshot);
                setVerifyStep(null);
                setNotice(copy.codeExpired, true);
            } else if (result.kind === "cancelled") {
                setSnapshot(result.snapshot);
                setVerifyStep(null);
                setNotice(copy.codeCancelled);
            } else if (result.kind === "resent") {
                setVerifyStep({
                    pending: result.pending,
                    code: "",
                    attemptsLeft: null,
                    error: null,
                });
            } else setNotice(result.message, true);
        } catch (error) {
            setNotice(
                error instanceof Error ? error.message : copy.failed,
                true,
            );
        } finally {
            setBusy(false);
        }
    }, [clearDrafts, router, setBusy, setNotice]);

    const resendCode = useCallback(async () => {
        const step = verifyRef.current;
        if (!step || busyRef.current) return;
        setBusy(true);
        try {
            const result = await emailAction({
                action: "resend",
                pendingId: step.pending.pendingId,
            });
            if (result.kind === "resent") {
                setVerifyStep({
                    pending: result.pending,
                    code: "",
                    attemptsLeft: null,
                    error: null,
                });
                setNotice(
                    copy.codeResent.replace("{email}", result.pending.email),
                );
            } else if (result.kind === "expired") {
                setSnapshot(result.snapshot);
                setVerifyStep(null);
                setNotice(copy.codeExpired, true);
            } else if (result.kind === "failed")
                setNotice(result.message, true);
        } catch (error) {
            setNotice(
                error instanceof Error ? error.message : copy.failed,
                true,
            );
        } finally {
            setBusy(false);
        }
    }, [setBusy, setNotice]);

    const cancelCode = useCallback(async () => {
        const step = verifyRef.current;
        if (!step || busyRef.current) return;
        setBusy(true);
        try {
            const result = await emailAction({
                action: "cancel",
                pendingId: step.pending.pendingId,
            });
            if (result.kind === "cancelled" || result.kind === "expired") {
                setSnapshot(result.snapshot);
                setVerifyStep(null);
                setNotice(copy.codeCancelled);
            } else if (result.kind === "failed")
                setNotice(result.message, true);
        } catch (error) {
            setNotice(
                error instanceof Error ? error.message : copy.failed,
                true,
            );
        } finally {
            setBusy(false);
        }
    }, [setBusy, setNotice]);

    return {
        load,
        snapshot,
        drafts,
        shown,
        setDraft,
        dirtyFields,
        /** True while a draft or a pending code would be lost by leaving. */
        isDirty: () =>
            dirtyRef.current.length > 0 || verifyRef.current !== null,
        status,
        notice,
        clearNotice: () => setNoticeState(null),
        verifyStep,
        setCode,
        pendingRefund,
        busy,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        reload,
        save,
        undo,
        redo,
        restore,
        confirmCode,
        resendCode,
        cancelCode,
    };
}
