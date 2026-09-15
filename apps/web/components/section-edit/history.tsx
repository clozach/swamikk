"use client";

import { useEffect, useRef, useState } from "react";
import type { SectionEdit } from "@courselit/common-models";
import { sectionEditUi as copy } from "@config/strings";
import { Button } from "@/components/ui/button";
import { Shortcut } from "@/components/feedback/shortcut";
import { fetchSectionHistory, type SectionHistoryPage } from "./api";

type Load =
    | { kind: "loading" }
    | { kind: "failed" }
    | ({ kind: "ready" } & SectionHistoryPage);
type Action =
    | { kind: "idle" }
    | { kind: "loading-more" }
    | { kind: "failed" }
    | { kind: "restoring"; editId: string };

/** A sibling heading inside the editor's existing History dialog. */
export function SectionHistory({
    pageId,
    userId,
    refreshKey,
    currentIds,
    disabled = false,
    onRestore,
}: {
    pageId: string;
    userId?: string;
    refreshKey: number;
    currentIds: string[];
    disabled?: boolean;
    onRestore: (edit: SectionEdit) => Promise<unknown>;
}) {
    const [load, setLoad] = useState<Load>({ kind: "loading" });
    const [retry, setRetry] = useState(0);
    const [action, setAction] = useState<Action>({ kind: "idle" });
    const pending = action.kind === "restoring" ? action.editId : null;
    const requestRef = useRef(0);
    const busyRef = useRef(false);
    useEffect(() => {
        const request = ++requestRef.current;
        setLoad({ kind: "loading" });
        setAction({ kind: "idle" });
        void fetchSectionHistory(pageId)
            .then((page) => {
                if (requestRef.current === request)
                    setLoad({ kind: "ready", ...page });
            })
            .catch(() => {
                if (requestRef.current === request) setLoad({ kind: "failed" });
            });
        return () => {
            requestRef.current += 1;
        };
    }, [pageId, refreshKey, retry]);

    const earlier = async () => {
        if (load.kind !== "ready" || !load.nextCursor || busyRef.current)
            return;
        const request = requestRef.current;
        busyRef.current = true;
        setAction({ kind: "loading-more" });
        try {
            const page = await fetchSectionHistory(pageId, load.nextCursor);
            if (requestRef.current === request)
                setLoad((current) =>
                    current.kind === "ready"
                        ? {
                              kind: "ready",
                              edits: [
                                  ...current.edits,
                                  ...page.edits.filter(
                                      (edit) =>
                                          !current.edits.some(
                                              (old) =>
                                                  old.editId === edit.editId,
                                          ),
                                  ),
                              ],
                              nextCursor: page.nextCursor,
                          }
                        : current,
                );
        } catch {
            if (requestRef.current === request) setAction({ kind: "failed" });
        } finally {
            busyRef.current = false;
            setAction((current) =>
                current.kind === "loading-more" ? { kind: "idle" } : current,
            );
        }
    };
    const restore = async (edit: SectionEdit) => {
        if (busyRef.current || disabled) return;
        busyRef.current = true;
        setAction({ kind: "restoring", editId: edit.editId });
        try {
            await onRestore(edit);
        } catch {
            setAction({ kind: "failed" });
        } finally {
            busyRef.current = false;
            setAction((current) =>
                current.kind === "restoring" ? { kind: "idle" } : current,
            );
        }
    };

    return (
        <section className="kk-section-history" aria-label={copy.historyTitle}>
            <h3 className="font-semibold">{copy.historyTitle}</h3>
            <p className="text-sm text-muted-foreground">{copy.historyIntro}</p>
            {load.kind === "loading" && <p role="status">{copy.loading}</p>}
            {load.kind === "failed" && (
                <div role="alert">
                    <p>{copy.historyFailed}</p>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setRetry((value) => value + 1)}
                    >
                        {copy.retry}
                    </Button>
                </div>
            )}
            {load.kind === "ready" && (
                <>
                    {!load.edits.length && <p>{copy.historyEmpty}</p>}
                    <ol className="kk-section-history-list">
                        {load.edits.map((edit) => {
                            const present = currentIds.includes(
                                edit.target.widgetId,
                            );
                            return (
                                <li
                                    className="kk-section-history-row"
                                    key={edit.editId}
                                >
                                    <div>
                                        <p>
                                            <strong>{edit.label}</strong> ·{" "}
                                            {edit.action === "remove"
                                                ? copy.historyRemoved
                                                : copy.historyRestored}
                                        </p>
                                        <p className="kk-section-history-meta">
                                            <time dateTime={edit.at}>
                                                {new Date(
                                                    edit.at,
                                                ).toLocaleString()}
                                            </time>{" "}
                                            ·{" "}
                                            {edit.userId === userId
                                                ? copy.you
                                                : edit.userId || copy.other}
                                        </p>
                                    </div>
                                    {edit.action === "remove" && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            aria-keyshortcuts="Enter"
                                            disabled={
                                                disabled ||
                                                action.kind ===
                                                    "loading-more" ||
                                                pending !== null ||
                                                present
                                            }
                                            onClick={() => void restore(edit)}
                                        >
                                            {pending === edit.editId
                                                ? copy.restoring
                                                : present
                                                  ? copy.alreadyPresent
                                                  : copy.restore}
                                            {!present &&
                                                pending !== edit.editId && (
                                                    <Shortcut>
                                                        {copy.activateShortcut}
                                                    </Shortcut>
                                                )}
                                        </Button>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                    {load.nextCursor && (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={
                                action.kind === "loading-more" ||
                                pending !== null
                            }
                            onClick={() => void earlier()}
                        >
                            {copy.historyMore}
                        </Button>
                    )}
                    {action.kind === "failed" && (
                        <p role="alert">{copy.historyFailed}</p>
                    )}
                </>
            )}
        </section>
    );
}
