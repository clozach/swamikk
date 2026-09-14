"use client";

import { useEffect, useState } from "react";
import type { TextEdit } from "@courselit/common-models";
import { textEditUi as copy } from "@config/strings";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fetchHistory } from "./api";
import { humanizePath, humanizeWidget } from "./leaves";

type Load =
    | { kind: "loading" }
    | { kind: "failed"; message: string }
    | { kind: "ready"; edits: TextEdit[]; nextCursor: string | null };

const when = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
        ? iso
        : date.toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
          });
};

/**
 * The durable way back: every applied inline edit on this page, newest first,
 * each with a permanently visible Restore. Rows never leave; a restore adds one.
 */
export default function HistoryPanel({
    pageId,
    userId,
    onRestore,
    refreshKey,
}: {
    pageId: string;
    userId?: string;
    onRestore: (edit: TextEdit) => Promise<TextEdit | null>;
    /** Bumped by the caller after any save so the list reloads. */
    refreshKey: number;
}) {
    // A result is keyed to the refresh it answered; a newer key reads as loading until it lands.
    const [state, setState] = useState<{ key: number; load: Load }>({
        key: -1,
        load: { kind: "loading" },
    });
    const load: Load =
        state.key === refreshKey ? state.load : { kind: "loading" };
    const [busy, setBusy] = useState<string | null>(null);
    useEffect(() => {
        let active = true;
        fetchHistory(pageId)
            .then((history) => {
                if (active)
                    setState({
                        key: refreshKey,
                        load: { kind: "ready", ...history },
                    });
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
        };
    }, [pageId, refreshKey]);

    async function more() {
        if (load.kind !== "ready" || !load.nextCursor) return;
        const next = await fetchHistory(pageId, load.nextCursor);
        setState({
            key: refreshKey,
            load: {
                kind: "ready",
                edits: [...load.edits, ...next.edits],
                nextCursor: next.nextCursor,
            },
        });
    }

    return (
        <div className="kk-text-history" data-kk-history-dialog>
            <DialogTitle>{copy.historyTitle}</DialogTitle>
            <DialogDescription>{copy.historyIntro}</DialogDescription>
            {load.kind === "loading" && <p role="status">{copy.loading}</p>}
            {load.kind === "failed" && <p role="alert">{load.message}</p>}
            {load.kind === "ready" && !load.edits.length && (
                <p>{copy.historyEmpty}</p>
            )}
            {load.kind === "ready" && !!load.edits.length && (
                <ol className="kk-text-history-list">
                    {load.edits.map((edit) => (
                        <li key={edit.editId} className="kk-text-history-row">
                            <div className="kk-text-history-meta">
                                <span>{when(edit.at)}</span>
                                <span>
                                    {edit.userId === userId
                                        ? copy.you
                                        : copy.other}
                                </span>
                                <span>
                                    {humanizeWidget(edit.widgetName)} ›{" "}
                                    {humanizePath(edit.target.path)}
                                    {edit.target.kind === "shared-widget-text"
                                        ? ` · ${copy.sitewide}`
                                        : ""}
                                </span>
                                {edit.undoOf && (
                                    <span>↶ reverses an earlier edit</span>
                                )}
                            </div>
                            <div className="kk-text-history-diff">
                                <del>{edit.before}</del>
                                <ins>{edit.after}</ins>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy === edit.editId}
                                onClick={async () => {
                                    setBusy(edit.editId);
                                    await onRestore(edit);
                                    setBusy(null);
                                }}
                            >
                                {copy.restore}
                            </Button>
                        </li>
                    ))}
                </ol>
            )}
            {load.kind === "ready" && load.nextCursor && (
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void more()}
                >
                    {copy.historyMore}
                </Button>
            )}
        </div>
    );
}
