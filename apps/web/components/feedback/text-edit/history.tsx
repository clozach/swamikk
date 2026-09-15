"use client";

import { useEffect, useRef, useState } from "react";
import type {
    TextChange,
    TextEdit,
    TextEditTarget,
} from "@courselit/common-models";
import { textEditUi as copy } from "@config/strings";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fetchHistory } from "./api";
import { humanizePath, humanizeWidget, nodePlain } from "./leaves";
import { sameNode } from "./runs";

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
const shown = (change: TextChange, side: "before" | "after") =>
    change.kind === "text" ? change[side] : nodePlain(change[side]);
/** True when the page already shows this change's red (before) text. */
const isCurrent = (change: TextChange, current: unknown) =>
    change.kind === "text"
        ? current === change.before
        : sameNode(current, change.before);

/**
 * A thin, penned-in arrow from the Restore button to the red text it restores,
 * drawn on a bezier through the row's left gutter. Measured in layout
 * coordinates (offsets within the row), which the dialog's opening zoom and
 * the page's scroll cannot disturb; remeasured whenever the row resizes.
 */
export function RestoreArrow({
    row,
    red,
    button,
}: {
    row: React.RefObject<HTMLLIElement>;
    red: React.RefObject<HTMLModElement>;
    button: React.RefObject<HTMLButtonElement>;
}) {
    const [d, setD] = useState("");
    const [size, setSize] = useState({ width: 0, height: 0 });
    useEffect(() => {
        const host = row.current;
        if (!host) return;
        const update = () => {
            const from = button.current;
            const to = red.current;
            if (!from || !to || !host.clientWidth) return;
            const x0 = from.offsetLeft + 14;
            const y0 = from.offsetTop + from.offsetHeight / 2;
            const gutter = 10;
            const x1 = to.offsetLeft - 3;
            const y1 = to.offsetTop + to.offsetHeight / 2;
            // Out of the button, up the gutter, and into the red block: a
            // hand-drawn hook rather than a ruler's line.
            setD(
                `M ${x0} ${y0} C ${gutter - 4} ${y0 + 6}, ${gutter + 2} ${y1 + 18}, ${x1} ${y1}`,
            );
            setSize({ width: host.clientWidth, height: host.clientHeight });
        };
        const frame = window.requestAnimationFrame(update);
        const settle = window.setTimeout(update, 320);
        const observer = new ResizeObserver(update);
        observer.observe(host);
        return () => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(settle);
            observer.disconnect();
        };
    }, [button, red, row]);
    if (!d || !size.width) return null;
    return (
        <svg
            className="kk-text-history-arrow"
            aria-hidden="true"
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
        >
            <defs>
                <marker
                    id="kk-pen-head"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto"
                >
                    <path
                        d="M 1 1.5 L 8.5 5 L 1 8.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </marker>
            </defs>
            <path
                d={d}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                markerEnd="url(#kk-pen-head)"
            />
        </svg>
    );
}

function HistoryRow({
    edit,
    userId,
    current,
    busy,
    onRestore,
}: {
    edit: TextEdit;
    userId?: string;
    current: (target: TextEditTarget, path: string) => unknown;
    busy: boolean;
    onRestore: () => Promise<void>;
}) {
    const row = useRef<HTMLLIElement>(null);
    const red = useRef<HTMLModElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    const alreadyCurrent = edit.changes.every((change) =>
        isCurrent(change, current(edit.target, change.path)),
    );
    return (
        <li ref={row} className="kk-text-history-row" tabIndex={-1}>
            <RestoreArrow row={row} red={red} button={button} />
            <div className="kk-text-history-meta">
                <span>{when(edit.at)}</span>
                <span>{edit.userId === userId ? copy.you : copy.other}</span>
                <span>
                    {humanizeWidget(edit.widgetName)} ›{" "}
                    {edit.changes
                        .map((change) => humanizePath(change.path))
                        .join(" + ")}
                    {edit.target.kind === "shared-widget-text"
                        ? ` · ${copy.sitewide}`
                        : ""}
                </span>
                {edit.undoOf && <span>↶ {copy.reverses}</span>}
            </div>
            {edit.changes.map((change, index) => (
                <div key={change.path} className="kk-text-history-diff">
                    <del ref={index === 0 ? red : undefined}>
                        <span
                            className="kk-text-history-cut"
                            aria-hidden="true"
                        >
                            <span>{copy.before}</span>
                        </span>
                        <span className="kk-text-history-words">
                            {shown(change, "before")}
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
                            {shown(change, "after")}
                        </span>
                    </ins>
                    {change.kind === "node" && (
                        <small className="kk-text-history-note">
                            {copy.formattingKept}
                        </small>
                    )}
                </div>
            ))}
            <Button
                ref={button}
                type="button"
                variant="outline"
                size="sm"
                className="kk-text-history-restore"
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
 * The durable way back: every applied inline edit on this page, newest first,
 * each with a permanently visible Restore. Rows never leave; a restore adds one.
 */
export default function HistoryPanel({
    pageId,
    userId,
    current,
    onRestore,
    refreshKey,
}: {
    pageId: string;
    userId?: string;
    /** What the page stores now at a target's path, so a row can say whether its red text is already showing. */
    current: (target: TextEditTarget, path: string) => unknown;
    onRestore: (edit: TextEdit) => Promise<TextEdit | null>;
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
        <div
            className="kk-text-history"
            data-kk-history-dialog
            aria-busy={reloading || undefined}
        >
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
                        <HistoryRow
                            key={edit.editId}
                            edit={edit}
                            userId={userId}
                            current={current}
                            busy={busy === edit.editId}
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
                    onClick={() => void more()}
                >
                    {copy.historyMore}
                </Button>
            )}
        </div>
    );
}
