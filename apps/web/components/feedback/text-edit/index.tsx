"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { History, Pencil, Redo2, Undo2, X } from "lucide-react";
import type { Profile } from "@courselit/common-models";
import { textEditUi as copy } from "@config/strings";
import { Button } from "@/components/ui/button";
import { SectionControls } from "@/components/section-edit/controls";
import { SectionHistory } from "@/components/section-edit/history";
import { useSectionEdit } from "@/components/section-edit/use-section-edit";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FeedbackNotice } from "../notice";
import { Shortcut } from "../shortcut";
import { SelectionTools } from "../selection-tools";
import { usePortalHost, useVisualViewport } from "../viewport";
import { currentAt, targetWidgetId } from "./leaves";
import { useTextEdit, type SectionEditBridge } from "./use-text-edit";
import HistoryPanel from "./history";
import { ImageEditControls } from "./image-controls";
import "./text-edit.css";

/** The run a chip belongs to may re-match under a path inside or around the saved one. */
const related = (a: string, b: string) =>
    a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);

/**
 * Inline text editing for site managers: a pill beside the ? control turns
 * the page into its own editor. Separate from the comment loop on purpose —
 * a comment asks for a change; this makes one, at once, with a way back.
 */
export default function TextEditSession({
    canEdit,
    hidden,
    profile,
    onModeChange,
}: {
    canEdit: boolean;
    /** True while the comment layer's own tools are open. */
    hidden: boolean;
    profile?: Profile | null;
    onModeChange: (editing: boolean) => void;
}) {
    const sectionBridge = useRef<SectionEditBridge | null>(null);
    const [imageBusy, setImageBusy] = useState(false);
    const state = useTextEdit(canEdit, sectionBridge, imageBusy);
    const host = usePortalHost();
    const viewport = useVisualViewport();
    const [history, setHistory] = useState(false);
    const [historyKey, setHistoryKey] = useState(0);
    const [chipRect, setChipRect] = useState<DOMRect | null>(null);
    const on = state.mode.kind === "on";
    const dialogOpen = history && on;
    const sections = useSectionEdit(
        state.mode.kind === "on" ? state.mode.pageId : null,
        {
            onApplied: (edit) => {
                state.recordSectionEdit(edit);
                setHistoryKey((key) => key + 1);
            },
            onError: (message) => state.setNotice(message, true),
            onRefresh: state.refresh,
            beforeChange: () => !state.editing && !state.saving,
        },
    );
    const sectionBusy = sections.pending.kind !== "idle";
    const reverseSection = sections.reverse;
    const refreshSections = sections.refresh;
    useLayoutEffect(() => {
        sectionBridge.current = {
            busy: sectionBusy,
            reverse: async (edit) => {
                const result = await reverseSection(edit);
                if (result) setHistoryKey((key) => key + 1);
                return result;
            },
        };
    }, [sectionBusy, reverseSection]);
    const lastTextEdit = state.chip?.edit.editId;
    useEffect(() => {
        if (lastTextEdit) void refreshSections();
    }, [lastTextEdit, refreshSections]);
    useEffect(
        () => onModeChange(state.mode.kind !== "off"),
        [onModeChange, state.mode.kind],
    );

    // The in-place way back sits on the run that changed and follows it.
    const chipElement = (() => {
        if (!state.chip || state.mode.kind !== "on") return null;
        const widgetId = targetWidgetId(state.mode.index, state.chip.target);
        const path = state.chip.path;
        return (
            state.mode.runs.find(
                (run) => run.widgetId === widgetId && related(run.path, path),
            )?.element || null
        );
    })();
    useEffect(() => {
        if (!chipElement) return;
        const update = () =>
            setChipRect(
                chipElement.isConnected
                    ? chipElement.getBoundingClientRect()
                    : null,
            );
        const frame = window.requestAnimationFrame(update);
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener("scroll", update, true);
            window.removeEventListener("resize", update);
        };
    }, [chipElement, viewport]);
    const chipBounds = chipElement ? chipRect : null;

    if (!canEdit || !host) return null;
    if (hidden && state.mode.kind === "off") return null;
    const count =
        state.mode.kind === "on"
            ? state.mode.runs.length
                ? copy.count.replace("{n}", String(state.mode.runs.length))
                : copy.none
            : copy.loading;
    // A notice answers the click that raised it: inside the open dialog it
    // stays reachable (the modal makes everything else inert).
    const notice = state.notice && (
        <FeedbackNotice
            message={state.notice.text}
            onDismiss={state.clearNotice}
        />
    );

    return (
        <>
            {sections.state.kind === "ready" && (
                <SectionControls
                    enabled={on}
                    page={sections.state.page}
                    pending={sections.pending}
                    disabled={
                        !!state.editing || state.busy || dialogOpen || imageBusy
                    }
                    onRemove={sections.remove}
                    onRestore={state.undoSection}
                />
            )}
            {state.mode.kind === "on" && (
                <ImageEditControls
                    pageId={state.mode.pageId}
                    index={state.mode.index}
                    disabled={
                        !!state.editing ||
                        state.busy ||
                        dialogOpen ||
                        sectionBusy
                    }
                    onBusy={setImageBusy}
                    onSave={async (...args) => {
                        const edit = await state.saveImage(...args);
                        setHistoryKey((key) => key + 1);
                        return edit;
                    }}
                />
            )}
            {createPortal(
                state.mode.kind === "off" ? (
                    <button
                        type="button"
                        className="kk-text-edit-pill"
                        data-feedback-ui
                        data-kk-text-edit-toggle
                        aria-keyshortcuts="Alt+Meta+E"
                        title={copy.toggleTitle}
                        onClick={() => void state.start()}
                    >
                        <Pencil size={18} aria-hidden="true" />
                        <span>{copy.toggle}</span>
                        <Shortcut>{copy.toggleShortcut}</Shortcut>
                    </button>
                ) : (
                    <div
                        className="kk-text-edit-bar border bg-background text-foreground shadow-xl"
                        data-feedback-ui
                        role="toolbar"
                        aria-label={copy.editing}
                    >
                        <span className="kk-text-edit-status" role="status">
                            <Pencil size={16} aria-hidden="true" />
                            <span>
                                {copy.editing}
                                {on ? ` · ${count}` : ` · ${copy.loading}`}
                            </span>
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={
                                !state.canUndo || sectionBusy || imageBusy
                            }
                            aria-keyshortcuts="Meta+Z"
                            onClick={() => void state.undo()}
                        >
                            <Undo2 size={16} aria-hidden="true" />
                            {copy.undo} <Shortcut>{copy.undoShortcut}</Shortcut>
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={
                                !state.canRedo || sectionBusy || imageBusy
                            }
                            aria-keyshortcuts="Meta+Shift+Z"
                            onClick={() => void state.redo()}
                        >
                            <Redo2 size={16} aria-hidden="true" />
                            {copy.redo} <Shortcut>{copy.redoShortcut}</Shortcut>
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-kk-history
                            disabled={!on || imageBusy}
                            onClick={() => setHistory(true)}
                        >
                            <History size={16} aria-hidden="true" />
                            {copy.history}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-kk-text-edit-toggle
                            aria-keyshortcuts="Escape"
                            disabled={imageBusy}
                            onClick={state.stop}
                        >
                            {copy.done} <Shortcut>{copy.doneShortcut}</Shortcut>
                        </Button>
                    </div>
                ),
                host,
            )}
            {state.chip && chipBounds && (
                <SelectionTools target={chipBounds} label={copy.changed}>
                    <span className="kk-text-edit-chip" data-kk-undo-chip>
                        {copy.changed}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-keyshortcuts="Meta+Z"
                        onClick={() => void state.undoChip()}
                    >
                        <Undo2 size={16} aria-hidden="true" />
                        {copy.undo} <Shortcut>{copy.undoShortcut}</Shortcut>
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setHistory(true)}
                    >
                        <History size={16} aria-hidden="true" />
                        {copy.history}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={copy.dismiss}
                        title={copy.dismiss}
                        onClick={state.dismissChip}
                    >
                        <X size={18} aria-hidden="true" />
                    </Button>
                </SelectionTools>
            )}
            {!dialogOpen && notice}
            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    if (!open) setHistory(false);
                }}
            >
                <DialogContent
                    data-feedback-ui
                    className="kk-feedback-dialog max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl"
                >
                    {state.mode.kind === "on" && (
                        <HistoryPanel
                            pageId={state.mode.pageId}
                            userId={profile?.userId}
                            refreshKey={historyKey}
                            current={(target, path) =>
                                state.mode.kind === "on"
                                    ? currentAt(state.mode.index, target, path)
                                    : undefined
                            }
                            disabled={
                                state.busy || sections.pending.kind !== "idle"
                            }
                            beforeEntries={
                                sections.state.kind === "ready" && (
                                    <SectionHistory
                                        pageId={state.mode.pageId}
                                        userId={profile?.userId}
                                        refreshKey={historyKey}
                                        currentIds={sections.state.page.sections.map(
                                            (section) => section.widgetId,
                                        )}
                                        disabled={
                                            state.busy ||
                                            sections.pending.kind !== "idle"
                                        }
                                        onRestore={sections.restore}
                                    />
                                )
                            }
                            onRestore={async (edit) => {
                                const result = await state.restore(edit);
                                if (result) setHistoryKey((key) => key + 1);
                                return result;
                            }}
                        />
                    )}
                    {dialogOpen && notice}
                </DialogContent>
            </Dialog>
        </>
    );
}
