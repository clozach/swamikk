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
import type {
    TextChange,
    TextEdit,
    TextEditTarget,
} from "@courselit/common-models";
import { textEditUi as copy } from "@config/strings";
import { fetchLeaves, submitEdit } from "./api";
import {
    applyChangesToIndex,
    currentAt,
    indexLeaves,
    normalizeText,
    targetWidgetId,
    type LeafIndex,
} from "./leaves";
import {
    contentTextNodes,
    domToNode,
    findRuns,
    markRuns,
    nodeTextSequence,
    orderedRuns,
    sameNode,
    stripArrow,
    unmarkRuns,
    visibleText,
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

/**
 * The page's own nodes under a run, recorded before typing so they can be put
 * back exactly. React patches by node identity, so an edit must never replace
 * the nodes it owns: the browser may split, wrap or drop them while typing,
 * and this snapshot restores the same objects with their original words.
 */
export interface Snapshot {
    parents: Array<[Element, ChildNode[]]>;
    texts: Array<[Text, string]>;
}

export interface Editing {
    run: Run;
    /** The stored value being edited: a string, or a rich-text node. */
    original: unknown;
    snapshot: Snapshot;
}

/** The in-place way back: the last saved edit and the run it landed on. */
export interface Chip {
    target: TextEditTarget;
    path: string;
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
const inDialog = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest("[role=dialog]");
const targetFor = (run: Run, pageId: string): TextEditTarget =>
    run.shared
        ? { kind: "shared-widget-text", pageId, name: run.widgetName }
        : { kind: "page-widget-text", pageId, widgetId: run.widgetId };
/** The words a run shows after typing: decoration left out, a trailing break dropped. */
const editedText = (element: HTMLElement) =>
    visibleText(element).replace(/ /g, " ").replace(/\n$/, "");
const placeCaretAtEnd = (element: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
};
/** Every change reversed: what an undo, a redo or a restore sends. */
export const reversed = (changes: TextChange[]): TextChange[] =>
    changes.map((change) =>
        change.kind === "text"
            ? { ...change, before: change.after, after: change.before }
            : { ...change, before: change.after, after: change.before },
    );

export function snapshotTree(root: Element): Snapshot {
    const parents: Array<[Element, ChildNode[]]> = [];
    const texts: Array<[Text, string]> = [];
    const visit = (element: Element) => {
        parents.push([element, Array.from(element.childNodes)]);
        element.childNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE)
                texts.push([node as Text, node.nodeValue || ""]);
            else if (node instanceof Element) visit(node);
        });
    };
    visit(root);
    return { parents, texts };
}
export function restoreTree(snapshot: Snapshot) {
    for (const [element, children] of snapshot.parents) {
        while (element.firstChild) element.removeChild(element.firstChild);
        for (const child of children) element.appendChild(child);
    }
    for (const [text, value] of snapshot.texts) text.nodeValue = value;
}

/**
 * Show saved words on a run by writing into the page's own text nodes — the
 * only mutation React survives — and only where the run's shape allows it;
 * anything else waits for the refresh to repaint.
 */
export function writeSaved(
    run: Run,
    changes: TextChange[],
    linkWords?: string,
) {
    const { element } = run;
    if (run.kind === "text") {
        const change = changes.find(
            (item) => item.kind === "text" && item.path === run.path,
        );
        const nodes = contentTextNodes(element);
        if (!change || change.kind !== "text" || nodes.length !== 1) return;
        nodes[0].nodeValue = element.querySelector("sup")
            ? stripArrow(change.after)
            : change.after;
        return;
    }
    if (run.kind === "linked-text") {
        const words = changes.find(
            (item) => item.kind === "text" && item.path === run.path,
        );
        const link = changes.find(
            (item) => item.kind === "text" && item.path === run.linkPath,
        );
        const anchor = element.querySelector("a");
        if (!anchor || (!words && !link)) return;
        const text =
            words?.kind === "text"
                ? words.after
                : normalizeText(visibleText(element, { arrows: false }));
        const linkText =
            link?.kind === "text"
                ? link.after
                : (linkWords ??
                  normalizeText(visibleText(anchor, { arrows: false })));
        const at = text.indexOf(linkText);
        const inside = contentTextNodes(anchor);
        const outside = contentTextNodes(element).filter(
            (node) => !anchor.contains(node),
        );
        if (at < 0 || inside.length !== 1 || outside.length > 2) return;
        inside[0].nodeValue = linkText;
        const pre = text.slice(0, at);
        const post = text.slice(at + linkText.length);
        const [first, last] = [outside[0], outside[outside.length - 1]];
        if (
            first &&
            first.compareDocumentPosition(anchor) &
                Node.DOCUMENT_POSITION_FOLLOWING
        )
            first.nodeValue = pre;
        if (
            last &&
            last !== first &&
            anchor.compareDocumentPosition(last) &
                Node.DOCUMENT_POSITION_FOLLOWING
        )
            last.nodeValue = post;
        else if (last && last === first && !pre) last.nodeValue = post;
        return;
    }
    const change = changes.find(
        (item) => item.kind === "node" && item.path === run.path,
    );
    if (!change || change.kind !== "node") return;
    const sequence = nodeTextSequence(change.after);
    const nodes = contentTextNodes(element);
    if (sequence.length !== nodes.length) return;
    nodes.forEach((node, index) => {
        const next = node.nextSibling;
        node.nodeValue =
            next instanceof Element && next.tagName === "SUP"
                ? stripArrow(sequence[index])
                : sequence[index];
    });
}

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
    const stacksRef = useRef({ undo: undoStack, redo: redoStack });
    useLayoutEffect(() => {
        modeRef.current = mode;
        editingRef.current = editing;
        stacksRef.current = { undo: undoStack, redo: redoStack };
    }, [mode, editing, undoStack, redoStack]);
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

    /** Mutate the page without the observer treating it as a page change. */
    const quietly = useCallback((write: () => void) => {
        suppressRef.current += 1;
        write();
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

    /** Put the page's own nodes back with their original words and end the edit. */
    const restoreEditing = useCallback(
        (current: Editing) => {
            quietly(() => restoreTree(current.snapshot));
            finishElement(current.run.element);
        },
        [finishElement, quietly],
    );

    const stop = useCallback(() => {
        const current = editingRef.current;
        if (current) {
            restoreEditing(current);
            setEditing(null);
        }
        unmarkRuns(pageRoot() || document.body);
        document.documentElement.removeAttribute("data-kk-text-edit");
        setMode({ kind: "off" });
        setChip(null);
        setNoticeState(null);
    }, [restoreEditing]);

    /** Record saved changes in the index and show them on every run they touch. */
    const applyLocally = useCallback(
        (target: TextEditTarget, changes: TextChange[]) => {
            const current = modeRef.current;
            if (current.kind !== "on") return;
            const widgetId = targetWidgetId(current.index, target);
            if (!widgetId) return;
            applyChangesToIndex(current.index, widgetId, changes);
            const paths = new Set(changes.map((change) => change.path));
            quietly(() => {
                for (const run of current.runs)
                    if (
                        run.widgetId === widgetId &&
                        (paths.has(run.path) ||
                            (run.linkPath !== undefined &&
                                paths.has(run.linkPath)))
                    )
                        writeSaved(
                            run,
                            changes,
                            run.linkPath
                                ? (current.index
                                      .get(widgetId)
                                      ?.byPath.get(run.linkPath)?.value ??
                                      undefined)
                                : undefined,
                        );
            });
        },
        [quietly],
    );

    const cancelEdit = useCallback(() => {
        const current = editingRef.current;
        if (!current) return;
        restoreEditing(current);
        current.run.element.blur();
        setEditing(null);
    }, [restoreEditing]);

    /** What an edited run now says, as the changes it would store — or nothing when it reads the same. */
    const changesFor = useCallback(
        (
            current: Editing,
            index: LeafIndex,
        ): TextChange[] | { refused: string } => {
            const { run, original } = current;
            const { element } = run;
            if (run.kind === "text") {
                const stored = String(original);
                const raw = editedText(element);
                // A label the renderer decorates with ↗ is stored with it; keep that.
                const text =
                    /↗\s*$/.test(stored) && !/↗\s*$/.test(raw)
                        ? `${raw} ↗`
                        : raw;
                return normalizeText(text) === normalizeText(stored)
                    ? []
                    : [
                          {
                              kind: "text",
                              path: run.path,
                              before: stored,
                              after: text,
                          },
                      ];
            }
            if (run.kind === "linked-text") {
                const anchors = element.querySelectorAll("a");
                if (anchors.length !== 1) return { refused: copy.linkKept };
                const stored = String(original);
                const arrows = /↗/.test(stored);
                const text = normalizeText(visibleText(element, { arrows }));
                const linkText = normalizeText(
                    visibleText(anchors[0], { arrows: false }),
                );
                const widget = index.get(run.widgetId);
                const storedLink = widget?.byPath.get(run.linkPath!)?.value;
                const changes: TextChange[] = [];
                if (text !== normalizeText(stored))
                    changes.push({
                        kind: "text",
                        path: run.path,
                        before: stored,
                        after: text,
                    });
                if (
                    storedLink !== undefined &&
                    linkText !== normalizeText(stripArrow(storedLink))
                ) {
                    if (!linkText) return { refused: copy.linkKept };
                    changes.push({
                        kind: "text",
                        path: run.linkPath!,
                        before: storedLink,
                        after: /↗\s*$/.test(storedLink)
                            ? `${linkText} ↗`
                            : linkText,
                    });
                }
                return changes;
            }
            const after = domToNode(element, original);
            return sameNode(after, original)
                ? []
                : [{ kind: "node", path: run.path, before: original, after }];
        },
        [],
    );

    const commitEdit = useCallback(async () => {
        const current = editingRef.current;
        const state = modeRef.current;
        if (!current || state.kind !== "on" || busyRef.current) return;
        const { run } = current;
        const changes = changesFor(current, state.index);
        // The page's nodes go back first; saved words are written into them after.
        restoreEditing(current);
        setEditing(null);
        if (!Array.isArray(changes)) {
            setNotice(changes.refused, true);
            return;
        }
        if (!changes.length) return;
        busyRef.current = true;
        run.element.setAttribute("data-kk-saving", "");
        const target = targetFor(run, state.pageId);
        quietly(() => writeSaved(run, changes));
        const outcome = await submitEdit({ target, changes });
        run.element.removeAttribute("data-kk-saving");
        busyRef.current = false;
        if (outcome.kind === "applied") {
            applyLocally(target, outcome.edit.changes);
            setUndoStack((stack) => [...stack, outcome.edit]);
            setRedoStack([]);
            setChip({ target, path: run.path, edit: outcome.edit });
            setNotice(copy.saved);
            router?.refresh();
        } else if (outcome.kind === "stale") {
            applyLocally(
                target,
                outcome.current.map((item) =>
                    typeof item.value === "string"
                        ? {
                              kind: "text",
                              path: item.path,
                              before: "",
                              after: item.value,
                          }
                        : {
                              kind: "node",
                              path: item.path,
                              before: null,
                              after: item.value,
                          },
                ),
            );
            setNotice(outcome.message, true);
            router?.refresh();
        } else {
            quietly(() => restoreTree(current.snapshot));
            setNotice(outcome.message, true);
        }
    }, [applyLocally, changesFor, quietly, restoreEditing, router, setNotice]);

    const beginEdit = useCallback((run: Run, viaKeyboard: boolean) => {
        const state = modeRef.current;
        if (state.kind !== "on" || editingRef.current || busyRef.current)
            return;
        const leaf = state.index.get(run.widgetId)?.byPath.get(run.path);
        if (!leaf) return;
        const original = run.kind === "rich-node" ? leaf.node : leaf.value;
        const { element } = run;
        const snapshot = snapshotTree(element);
        if (run.kind === "text") {
            element.setAttribute("contenteditable", "plaintext-only");
            if (!element.isContentEditable)
                element.setAttribute("contenteditable", "true");
        } else element.setAttribute("contenteditable", "true");
        element.setAttribute("data-kk-editing", "");
        element.setAttribute("spellcheck", "true");
        if (element instanceof HTMLAnchorElement)
            element.setAttribute("draggable", "false");
        setEditing({ run, original, snapshot });
        element.focus();
        if (viaKeyboard) placeCaretAtEnd(element);
    }, []);

    /** Post the reversal of a recorded edit; the reversal is itself recorded. */
    const reverse = useCallback(
        async (edit: TextEdit, changes = reversed(edit.changes)) => {
            const state = modeRef.current;
            if (state.kind !== "on" || busyRef.current) return null;
            busyRef.current = true;
            const outcome = await submitEdit({
                target: edit.target,
                changes,
                undoOf: edit.editId,
            });
            busyRef.current = false;
            if (outcome.kind === "applied") {
                applyLocally(edit.target, outcome.edit.changes);
                setChip({
                    target: edit.target,
                    path: changes[0].path,
                    edit: outcome.edit,
                });
                router?.refresh();
                return outcome.edit;
            }
            if (outcome.kind === "stale") {
                applyLocally(
                    edit.target,
                    outcome.current.map((item) =>
                        typeof item.value === "string"
                            ? {
                                  kind: "text",
                                  path: item.path,
                                  before: "",
                                  after: item.value,
                              }
                            : {
                                  kind: "node",
                                  path: item.path,
                                  before: null,
                                  after: item.value,
                              },
                    ),
                );
                router?.refresh();
            }
            setNotice(outcome.message, true);
            return null;
        },
        [applyLocally, router, setNotice],
    );

    const undo = useCallback(async () => {
        if (editingRef.current) cancelEdit();
        const stack = stacksRef.current.undo;
        const last = stack[stack.length - 1];
        if (!last) return;
        setUndoStack((items) => items.filter((item) => item !== last));
        const reversal = await reverse(last);
        if (reversal) {
            setRedoStack((items) => [...items, reversal]);
            setNotice(copy.undone);
        }
    }, [cancelEdit, reverse, setNotice]);

    const redo = useCallback(async () => {
        if (editingRef.current) cancelEdit();
        const stack = stacksRef.current.redo;
        const last = stack[stack.length - 1];
        if (!last) return;
        setRedoStack((items) => items.filter((item) => item !== last));
        const reversal = await reverse(last);
        if (reversal) {
            setUndoStack((items) => [...items, reversal]);
            setNotice(copy.redone);
        }
    }, [cancelEdit, reverse, setNotice]);

    /** Restore a history row's earlier text (its red text) against whatever the page shows now. */
    const restore = useCallback(
        async (edit: TextEdit) => {
            const state = modeRef.current;
            if (state.kind !== "on") return null;
            const changes: TextChange[] = [];
            for (const change of edit.changes) {
                const current = currentAt(
                    state.index,
                    edit.target,
                    change.path,
                );
                if (current === undefined) {
                    setNotice(copy.historyGone, true);
                    return null;
                }
                if (change.kind === "text") {
                    if (current !== change.before)
                        changes.push({
                            ...change,
                            before: String(current),
                            after: change.before,
                        });
                } else if (!sameNode(current, change.before))
                    changes.push({
                        ...change,
                        before: current,
                        after: change.before,
                    });
            }
            if (!changes.length) {
                setNotice(copy.unchanged);
                return null;
            }
            const reversal = await reverse(edit, changes);
            if (reversal) {
                setUndoStack((items) => [...items, reversal]);
                setRedoStack([]);
                setNotice(copy.restored);
            }
            return reversal;
        },
        [reverse, setNotice],
    );

    /** The chip reverses the edit it shows, whichever stack that edit sits in. */
    const undoChip = useCallback(async () => {
        const shown = chip?.edit;
        if (!shown) return;
        const { undo: undos, redo: redos } = stacksRef.current;
        const fromUndo = undos.includes(shown);
        if (fromUndo)
            setUndoStack((items) => items.filter((item) => item !== shown));
        else setRedoStack((items) => items.filter((item) => item !== shown));
        const reversal = await reverse(shown);
        if (reversal) {
            if (fromUndo) setRedoStack((items) => [...items, reversal]);
            else setUndoStack((items) => [...items, reversal]);
            setNotice(copy.undone);
            setChip(null);
        } else if (fromUndo) setUndoStack((items) => [...items, shown]);
        else if (redos.includes(shown))
            setRedoStack((items) => [...items, shown]);
    }, [chip, reverse, setNotice]);

    // Pointer: make the run editable on pointerdown so the caret lands where
    // the finger is; swallow the click so a link run does not navigate. A
    // pointerdown on another run saves the first, then opens the second.
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
            if (editingRef.current) {
                event.preventDefault();
                void commitEdit().then(() => beginEdit(run, true));
                return;
            }
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
    // steps to the next run; a button run must not fire on Space or Enter;
    // pasted content arrives as plain text so no foreign markup enters a run.
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
        const paste = (event: ClipboardEvent) => {
            const text = event.clipboardData?.getData("text/plain");
            if (text === undefined) return;
            event.preventDefault();
            document.execCommand("insertText", false, text);
        };
        const blur = () => {
            void commitEdit();
        };
        element.addEventListener("keydown", keydown);
        element.addEventListener("keyup", keyup);
        element.addEventListener("paste", paste);
        element.addEventListener("blur", blur);
        return () => {
            element.removeEventListener("keydown", keydown);
            element.removeEventListener("keyup", keyup);
            element.removeEventListener("paste", paste);
            element.removeEventListener("blur", blur);
        };
    }, [cancelEdit, commitEdit, editing]);

    // Global keys: ⌥⌘E toggles; while on, Escape ladders out one level (a
    // dialog closes itself first), ⌘Z / ⇧⌘Z undo and redo, and Enter or Space
    // on a focused run starts editing.
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
                if (editingRef.current || inDialog(event.target)) return;
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
