"use client";

import { useEffect, useRef, useState } from "react";
import type {
    MemberEdit,
    MemberEditChange,
    MemberEditField,
} from "@courselit/common-models";
import { memberEditUi as copy } from "@config/strings";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RestoreArrow } from "../../feedback/text-edit/history";
import "../../feedback/text-edit/text-edit.css";
import { fetchHistory } from "./api";

type Load =
    | { kind: "loading" }
    | { kind: "failed"; message: string }
    | { kind: "ready"; edits: MemberEdit[]; nextCursor: string | null };

const when = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
        ? iso
        : date.toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
          });
};

/** A stored value as a person reads it: a contact kind or check-in choice by its label. */
export const humanValue = (field: MemberEditField, value: string) => {
    if (field === "contact.kind")
        return (
            copy.contactKind[value as keyof typeof copy.contactKind] ?? value
        );
    if (field === "checkIns")
        return copy.checkIns[value as keyof typeof copy.checkIns] ?? value;
    return value;
};

function HistoryRow({
    edit,
    actorUserId,
    current,
    busy,
    onRestore,
}: {
    edit: MemberEdit;
    actorUserId: string;
    current: (field: MemberEditField) => string;
    busy: boolean;
    onRestore: () => Promise<void>;
}) {
    const row = useRef<HTMLLIElement>(null);
    const red = useRef<HTMLModElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    const alreadyCurrent = edit.changes.every(
        (change: MemberEditChange) => current(change.field) === change.before,
    );
    const who =
        edit.editorUserId === actorUserId
            ? copy.you
            : edit.editor?.name || edit.editor?.email || copy.other;
    return (
        <li
            ref={row}
            className="kk-text-history-row"
            data-kk-member-edit-history-row={edit.editId}
            tabIndex={-1}
        >
            <RestoreArrow row={row} red={red} button={button} />
            <div className="kk-text-history-meta">
                <span>{when(edit.at)}</span>
                <span>{who}</span>
                {edit.undoOf && <span>{copy.reverses}</span>}
            </div>
            {edit.changes.map((change, index) => (
                <div key={change.field} className="kk-text-history-diff">
                    <span className="kk-member-edit-history-field">
                        {copy.changeLabels[change.field]}
                    </span>
                    <del ref={index === 0 ? red : undefined}>
                        <span
                            className="kk-text-history-cut"
                            aria-hidden="true"
                        >
                            <span>{copy.before}</span>
                        </span>
                        <span className="kk-text-history-words">
                            {humanValue(change.field, change.before)}
                        </span>
                    </del>
                    <ins>
                        <span
                            className="kk-text-history-cut"
                            aria-hidden="true"
                        >
                            <span>{copy.after}</span>
                        </span>
                        <span className="kk-text-history-words">
                            {humanValue(change.field, change.after)}
                        </span>
                    </ins>
                </div>
            ))}
            <Button
                ref={button}
                type="button"
                variant="outline"
                size="sm"
                className="kk-text-history-restore"
                data-kk-member-edit-restore
                disabled={busy || alreadyCurrent}
                title={alreadyCurrent ? copy.alreadyCurrent : undefined}
                onClick={async () => {
                    await onRestore();
                    // The button disables once its red text shows; keep the keyboard on the row.
                    row.current?.focus();
                }}
            >
                {alreadyCurrent ? copy.alreadyCurrent : copy.restoreRed}
            </Button>
        </li>
    );
}

/**
 * The durable way back: every applied edit to this member, newest first, each
 * with a permanently visible Restore. Rows never leave; a restore adds one.
 */
export default function MemberEditHistory({
    actorUserId,
    current,
    onRestore,
    refreshKey,
}: {
    actorUserId: string;
    /** What the record holds now, so a row can say whether its red text already shows. */
    current: (field: MemberEditField) => string;
    onRestore: (edit: MemberEdit) => Promise<MemberEdit | null>;
    /** Bumped by the caller after any save so the list reloads. */
    refreshKey: number;
}) {
    // Rows stay on screen while a newer key reloads; only the first load reads as loading.
    const [state, setState] = useState<{ key: number; load: Load }>({
        key: -1,
        load: { kind: "loading" },
    });
    const load = state.load;
    const reloading = state.key !== refreshKey && load.kind === "ready";
    const [busy, setBusy] = useState<string | null>(null);
    const [moreState, setMoreState] = useState<
        { kind: "idle" | "loading" } | { kind: "failed"; message: string }
    >({ kind: "idle" });
    const generation = useRef(0);
    useEffect(() => {
        generation.current += 1;
        let active = true;
        fetchHistory()
            .then((history) => {
                if (active) {
                    setMoreState({ kind: "idle" });
                    setState({
                        key: refreshKey,
                        load: { kind: "ready", ...history },
                    });
                }
            })
            .catch((error) => {
                if (active)
                    setState({
                        key: refreshKey,
                        load: {
                            kind: "failed",
                            message:
                                error instanceof Error
                                    ? error.message
                                    : copy.failed,
                        },
                    });
            });
        return () => {
            active = false;
            generation.current += 1;
        };
    }, [refreshKey]);

    async function more() {
        if (
            load.kind !== "ready" ||
            !load.nextCursor ||
            moreState.kind === "loading"
        )
            return;
        const requestGeneration = generation.current;
        setMoreState({ kind: "loading" });
        try {
            const next = await fetchHistory(load.nextCursor);
            if (generation.current !== requestGeneration) return;
            setState({
                key: refreshKey,
                load: {
                    kind: "ready",
                    edits: [...load.edits, ...next.edits],
                    nextCursor: next.nextCursor,
                },
            });
            setMoreState({ kind: "idle" });
        } catch (error) {
            if (generation.current === requestGeneration)
                setMoreState({
                    kind: "failed",
                    message:
                        error instanceof Error ? error.message : copy.failed,
                });
        }
    }

    return (
        <div
            className="kk-text-history"
            data-kk-member-edit-history-dialog
            aria-busy={reloading || undefined}
        >
            <DialogTitle>{copy.historyTitle}</DialogTitle>
            <DialogDescription>{copy.historyIntro}</DialogDescription>
            {load.kind === "loading" && (
                <p role="status">{copy.historyLoading}</p>
            )}
            {load.kind === "failed" && <p role="alert">{load.message}</p>}
            {load.kind === "ready" && !load.edits.length && (
                <p>{copy.historyEmpty}</p>
            )}
            {load.kind === "ready" && !!load.edits.length && (
                <ol className="kk-text-history-list">
                    {load.edits.map((edit) => (
                        <HistoryRow
                            key={edit.editId}
                            edit={edit}
                            actorUserId={actorUserId}
                            current={current}
                            busy={busy !== null || reloading}
                            onRestore={async () => {
                                setBusy(edit.editId);
                                await onRestore(edit);
                                setBusy(null);
                            }}
                        />
                    ))}
                </ol>
            )}
            {load.kind === "ready" && load.nextCursor && (
                <Button
                    type="button"
                    variant="ghost"
                    data-kk-member-edit-history-more
                    disabled={moreState.kind === "loading" || reloading}
                    onClick={() => void more()}
                >
                    {copy.historyMore}
                </Button>
            )}
            {moreState.kind === "failed" && (
                <p role="alert">{moreState.message}</p>
            )}
        </div>
    );
}
