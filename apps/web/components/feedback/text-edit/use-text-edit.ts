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
import type { TextEdit, TextEditTarget } from "@courselit/common-models";
import { textEditUi as copy } from "@config/strings";
import { fetchLeaves, submitEdit } from "./api";
import {
    indexLeaves,
    leafValue,
    normalizeText,
    targetWidgetId,
    updateLeaf,
    type LeafIndex,
} from "./leaves";
import {
    findRuns,
    markRuns,
    orderedRuns,
    unmarkRuns,
    RUN_ATTR,
    type Run,
} from "./runs";

/** The mode's states are exclusive: off, loading, or on with what it found. */
export type Mode =
    | { kind: "off" }
    | { kind: "loading" }
    | {
          kind: "on";
          pageId: string;
          index: LeafIndex;
          runs: Run[];
          ambiguous: number;
      };

export interface Editing {
    run: Run;
    /** The stored value being edited (not the rendered text). */
    original: string;
}

export interface Chip {
    target: TextEditTarget;
    edit: TextEdit;
}

export type Notice = { text: string; sticky: boolean } | null;

const pageRoot = () =>
    document.querySelector<HTMLElement>("[data-feedback-page]");
const isTyping = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !!target.closest(
        "input,textarea,select,[contenteditable=true],[contenteditable=plaintext-only]",
    );
const targetFor = (run: Run, pageId: string): TextEditTarget =>
    run.shared
        ? {
              kind: "shared-widget-text",
              pageId,
              name: run.widgetName,
              path: run.path,
          }
        : {
              kind: "page-widget-text",
              pageId,
              widgetId: run.widgetId,
              path: run.path,
          };
const sameTarget = (a: TextEditTarget, b: TextEditTarget) =>
    a.kind === b.kind &&
    a.path === b.path &&
    (a.kind === "page-widget-text"
        ? a.widgetId === (b as typeof a).widgetId
        : a.name === (b as typeof a).name);
/** contentEditable text as the browser shows it; jsdom has no innerText. */
const editedText = (element: HTMLElement) =>
    (typeof element.innerText === "string"
        ? element.innerText
        : element.textContent || ""
    )
        .replace(/\u00a0/g, " ")
        .replace(/\n$/, "");
const placeCaretAtEnd = (element: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
};

export function useTextEdit(enabled: boolean) {
    // Null outside the app router (tests, the pages router); a refresh is then a no-op.
    const router = useContext(AppRouterContext);
    const [mode, setMode] = useState<Mode>({ kind: "off" });
    const [editing, setEditing] = useState<Editing | null>(null);
    const [chip, setChip] = useState<Chip | null>(null);
    const [undoStack, setUndoStack] = useState<TextEdit[]>([]);
    const [redoStack, setRedoStack] = useState<TextEdit[]>([]);
    const [notice, setNoticeState] = useState<Notice>(null);
    // Event handlers read the latest state through refs, synced right after each commit.
    const modeRef = useRef(mode);
    const editingRef = useRef(editing);
    useLayoutEffect(() => {
        modeRef.current = mode;
        editingRef.current = editing;
    }, [mode, editing]);
    const suppressRef = useRef(0);
    const busyRef = useRef(false);

    const setNotice = useCallback((text: string, sticky = false) => {
        setNoticeState(text ? { text, sticky } : null);
    }, []);
    useEffect(() => {
        if (!notice || notice.sticky) return;
        const timer = window.setTimeout(() => setNoticeState(null), 4000);
        return () => window.clearTimeout(timer);
    }, [notice]);

    /** Rewrite a run's text without the observer treating it as a page change. */
    const writeText = useCallback((element: HTMLElement, value: string) => {
        suppressRef.current += 1;
        element.textContent = value;
        window.setTimeout(() => {
            suppressRef.current = Math.max(0, suppressRef.current - 1);
        }, 0);
    }, []);

    const scan = useCallback((pageId: string, index: LeafIndex) => {
        const root = pageRoot() || document.body;
        unmarkRuns(root);
        const found = findRuns(root, index);
        markRuns(found, copy);
        setMode({
            kind: "on",
            pageId,
            index,
            runs: orderedRuns(found.runs),
            ambiguous: found.ambiguous.length,
        });
    }, []);

    const finishElement = useCallback((element: HTMLElement) => {
        element.removeAttribute("contenteditable");
        element.removeAttribute("data-kk-editing");
        element.removeAttribute("draggable");
        element.removeAttribute("spellcheck");
    }, []);

    const start = useCallback(async () => {
        if (modeRef.current.kind !== "off") return;
        const pageId = pageRoot()?.dataset.feedbackPage;
        if (!pageId) {
            setNotice(copy.noPage, true);
            return;
        }
        setMode({ kind: "loading" });
        try {
            const index = indexLeaves(await fetchLeaves(pageId));
            document.documentElement.setAttribute("data-kk-text-edit", "");
            scan(pageId, index);
        } catch (error) {
            setMode({ kind: "off" });
            setNotice(
                error instanceof Error ? error.message : copy.failed,
                true,
            );
        }
    }, [scan, setNotice]);

    const stop = useCallback(() => {
        const current = editingRef.current;
        if (current) {
            writeText(current.run.element, current.original);
            finishElement(current.run.element);
            setEditing(null);
        }
        unmarkRuns(pageRoot() || document.body);
        document.documentElement.removeAttribute("data-kk-text-edit");
        setMode({ kind: "off" });
        setChip(null);
        setNoticeState(null);
    }, [finishElement, writeText]);

    /** Apply a saved value to every run showing that target and to the index. */
    const applyLocally = useCallback(
        (target: TextEditTarget, value: string) => {
            const current = modeRef.current;
            if (current.kind !== "on") return;
            const widgetId = targetWidgetId(current.index, target);
            if (!widgetId) return;
            updateLeaf(current.index, widgetId, target.path, value);
            for (const run of current.runs)
                if (run.widgetId === widgetId && run.path === target.path)
                    writeText(run.element, value);
        },
        [writeText],
    );

    const cancelEdit = useCallback(() => {
        const current = editingRef.current;
        if (!current) return;
        writeText(current.run.element, current.original);
        finishElement(current.run.element);
        current.run.element.blur();
        setEditing(null);
    }, [finishElement, writeText]);

    const commitEdit = useCallback(async () => {
        const current = editingRef.current;
        const state = modeRef.current;
        if (!current || state.kind !== "on" || busyRef.current) return;
        const { run, original } = current;
        const text = editedText(run.element);
        finishElement(run.element);
        setEditing(null);
        if (normalizeText(text) === normalizeText(original)) {
            writeText(run.element, original);
            return;
        }
        busyRef.current = true;
        run.element.setAttribute("data-kk-saving", "");
        const target = targetFor(run, state.pageId);
        const outcome = await submitEdit({
            target,
            before: original,
            after: text,
        });
        run.element.removeAttribute("data-kk-saving");
        busyRef.current = false;
        if (outcome.kind === "applied") {
            applyLocally(target, outcome.edit.after);
            setUndoStack((stack) => [...stack, outcome.edit]);
            setRedoStack([]);
            setChip({ target, edit: outcome.edit });
            setNotice(copy.saved);
            router?.refresh();
        } else if (outcome.kind === "stale") {
            applyLocally(target, outcome.current);
            setNotice(outcome.message, true);
        } else {
            writeText(run.element, original);
            setNotice(outcome.message, true);
        }
    }, [applyLocally, finishElement, router, setNotice, writeText]);

    const beginEdit = useCallback((run: Run, viaKeyboard: boolean) => {
        const state = modeRef.current;
        if (state.kind !== "on" || editingRef.current || busyRef.current)
            return;
        const original = state.index
            .get(run.widgetId)
            ?.byPath.get(run.path)?.value;
        if (original === undefined) return;
        const { element } = run;
        element.setAttribute("contenteditable", "plaintext-only");
        if (!element.isContentEditable)
            element.setAttribute("contenteditable", "true");
        element.setAttribute("data-kk-editing", "");
        element.setAttribute("spellcheck", "true");
        if (element instanceof HTMLAnchorElement)
            element.setAttribute("draggable", "false");
        setEditing({ run, original });
        element.focus();
        if (viaKeyboard) placeCaretAtEnd(element);
    }, []);

    /** Post the reversal of a recorded edit; the reversal is itself recorded. */
    const reverse = useCallback(
        async (edit: TextEdit, expectedCurrent?: string) => {
            const state = modeRef.current;
            if (state.kind !== "on" || busyRef.current) return null;
            const before = expectedCurrent ?? edit.after;
            busyRef.current = true;
            const outcome = await submitEdit({
                target: edit.target,
                before,
                after: edit.before,
                undoOf: edit.editId,
            });
            busyRef.current = false;
            if (outcome.kind === "applied") {
                applyLocally(edit.target, outcome.edit.after);
                setChip({ target: edit.target, edit: outcome.edit });
                router?.refresh();
                return outcome.edit;
            }
            if (outcome.kind === "stale")
                applyLocally(edit.target, outcome.current);
            setNotice(outcome.message, true);
            return null;
        },
        [applyLocally, router, setNotice],
    );

    const undo = useCallback(async () => {
        if (editingRef.current) cancelEdit();
        const last = undoStack[undoStack.length - 1];
        if (!last) return;
        setUndoStack((stack) => stack.slice(0, -1));
        const reversal = await reverse(last);
        if (reversal) {
            setRedoStack((stack) => [...stack, reversal]);
            setNotice(copy.undone);
        }
    }, [cancelEdit, reverse, setNotice, undoStack]);

    const redo = useCallback(async () => {
        if (editingRef.current) cancelEdit();
        const last = redoStack[redoStack.length - 1];
        if (!last) return;
        setRedoStack((stack) => stack.slice(0, -1));
        const reversal = await reverse(last);
        if (reversal) {
            setUndoStack((stack) => [...stack, reversal]);
            setNotice(copy.redone);
        }
    }, [cancelEdit, redoStack, reverse, setNotice]);

    /** Restore a history row's earlier text against whatever the page shows now. */
    const restore = useCallback(
        async (edit: TextEdit) => {
            const state = modeRef.current;
            if (state.kind !== "on") return null;
            const current = leafValue(state.index, edit.target);
            if (current === undefined) {
                setNotice(copy.historyGone, true);
                return null;
            }
            if (current === edit.before) {
                setNotice(copy.unchanged);
                return null;
            }
            const reversal = await reverse(edit, current);
            if (reversal) {
                setUndoStack((stack) => [...stack, reversal]);
                setRedoStack([]);
                setNotice(copy.restored);
            }
            return reversal;
        },
        [reverse, setNotice],
    );

    const undoChip = useCallback(async () => {
        const target = chip?.target;
        if (!target) return;
        const entry = [...undoStack]
            .reverse()
            .find((edit) => sameTarget(edit.target, target));
        if (!entry) return;
        setUndoStack((stack) => stack.filter((edit) => edit !== entry));
        const reversal = await reverse(entry);
        if (reversal) {
            setRedoStack((stack) => [...stack, reversal]);
            setNotice(copy.undone);
            setChip(null);
        }
    }, [chip, reverse, setNotice, undoStack]);

    // Pointer: make the run editable on pointerdown so the caret lands where
    // the finger is; swallow the click so a link run does not navigate.
    useEffect(() => {
        if (mode.kind !== "on") return;
        const runFor = (target: EventTarget | null) => {
            if (!(target instanceof Element)) return null;
            const element = target.closest<HTMLElement>(`[${RUN_ATTR}]`);
            if (!element) return null;
            return modeRef.current.kind === "on"
                ? modeRef.current.runs.find((run) => run.element === element) ||
                      null
                : null;
        };
        const down = (event: PointerEvent) => {
            if (event.button && event.button !== 0) return;
            const run = runFor(event.target);
            if (!run) return;
            if (editingRef.current?.run.element === run.element) return;
            if (editingRef.current) void commitEdit();
            beginEdit(run, false);
        };
        const click = (event: MouseEvent) => {
            const element =
                event.target instanceof Element
                    ? event.target.closest<HTMLElement>(
                          `[${RUN_ATTR}], [data-kk-editing]`,
                      )
                    : null;
            if (element) {
                event.preventDefault();
                event.stopPropagation();
            }
        };
        window.addEventListener("pointerdown", down, true);
        window.addEventListener("click", click, true);
        return () => {
            window.removeEventListener("pointerdown", down, true);
            window.removeEventListener("click", click, true);
        };
    }, [beginEdit, commitEdit, mode.kind]);

    // Keys on the run being edited: Enter saves, Escape cancels, Tab saves and
    // steps to the next run; a button run must not fire on Space or Enter.
    useEffect(() => {
        if (!editing) return;
        const { element } = editing.run;
        const keydown = (event: KeyboardEvent) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.stopPropagation();
                void commitEdit();
            } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancelEdit();
            } else if (event.key === "Tab") {
                event.preventDefault();
                event.stopPropagation();
                const state = modeRef.current;
                const runs = state.kind === "on" ? state.runs : [];
                const at = runs.findIndex((run) => run.element === element);
                const next = runs[at + (event.shiftKey ? -1 : 1)];
                void commitEdit().then(() => next?.element.focus());
            } else if (
                event.key === " " &&
                element instanceof HTMLButtonElement
            ) {
                event.stopPropagation();
            }
        };
        const keyup = (event: KeyboardEvent) => {
            if (
                (event.key === " " || event.key === "Enter") &&
                element instanceof HTMLButtonElement
            )
                event.preventDefault();
        };
        const blur = () => {
            void commitEdit();
        };
        element.addEventListener("keydown", keydown);
        element.addEventListener("keyup", keyup);
        element.addEventListener("blur", blur);
        return () => {
            element.removeEventListener("keydown", keydown);
            element.removeEventListener("keyup", keyup);
            element.removeEventListener("blur", blur);
        };
    }, [cancelEdit, commitEdit, editing]);

    // Global keys: ⌥⌘E toggles; while on, Escape ladders out one level, ⌘Z / ⇧⌘Z
    // undo and redo, and Enter or Space on a focused run starts editing.
    useEffect(() => {
        if (!enabled) return;
        const keydown = (event: KeyboardEvent) => {
            const state = modeRef.current;
            if (
                (event.metaKey || event.ctrlKey) &&
                event.altKey &&
                event.code === "KeyE"
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (state.kind === "off") void start();
                else if (state.kind === "on") stop();
                return;
            }
            if (state.kind !== "on") return;
            if (event.key === "Escape") {
                if (editingRef.current) return; // the run's own handler cancels first
                event.preventDefault();
                event.stopImmediatePropagation();
                stop();
                return;
            }
            if (isTyping(event.target)) return;
            if (
                (event.metaKey || event.ctrlKey) &&
                !event.altKey &&
                event.code === "KeyZ"
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
                void (event.shiftKey ? redo() : undo());
                return;
            }
            if (
                (event.key === "Enter" || event.key === " ") &&
                event.target instanceof HTMLElement &&
                event.target.hasAttribute(RUN_ATTR)
            ) {
                const run = state.runs.find(
                    (item) => item.element === event.target,
                );
                if (!run) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                beginEdit(run, true);
            }
        };
        window.addEventListener("keydown", keydown, true);
        return () => window.removeEventListener("keydown", keydown, true);
    }, [beginEdit, enabled, redo, start, stop, undo]);

    // The page re-renders after every save (router.refresh) and on its own;
    // re-match runs when it does, never while a run is being edited.
    useEffect(() => {
        if (mode.kind !== "on") return;
        const root = pageRoot();
        if (!root) return;
        let timer = 0;
        const observer = new MutationObserver(() => {
            if (suppressRef.current || editingRef.current) return;
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                const state = modeRef.current;
                if (state.kind === "on" && !editingRef.current)
                    scan(state.pageId, state.index);
            }, 250);
        });
        observer.observe(root, {
            childList: true,
            subtree: true,
            characterData: true,
        });
        return () => {
            observer.disconnect();
            window.clearTimeout(timer);
        };
    }, [mode.kind, scan]);

    useEffect(
        () => () =>
            document.documentElement.removeAttribute("data-kk-text-edit"),
        [],
    );

    return {
        mode,
        editing,
        chip,
        notice,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        start,
        stop,
        undo,
        redo,
        restore,
        undoChip,
        dismissChip: () => setChip(null),
        clearNotice: () => setNoticeState(null),
        setNotice,
    };
}
