import type { TextLeafKind } from "@courselit/common-models";
import { normalizeText, type LeafIndex } from "./leaves";

/** One rendered run of text that reads exactly as one stored leaf. */
export interface Run {
    element: HTMLElement;
    widgetId: string;
    widgetName: string;
    path: string;
    shared: boolean;
    kind: TextLeafKind;
}

export const RUN_ATTR = "data-kk-editable";
export const AMBIGUOUS_ATTR = "data-kk-ambiguous";
const skipped =
    "[data-feedback-ui], script, style, noscript, template, svg, input, textarea, select, option, [contenteditable=true], [contenteditable=plaintext-only]";

/** The element's own text: its direct text nodes, in order. */
export function ownText(element: Element) {
    let text = "";
    element.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue || "";
    });
    return text;
}

const escapeAttr = (value: string) =>
    typeof CSS !== "undefined" && CSS.escape
        ? CSS.escape(value)
        : value.replace(/["\\]/g, "\\$&");

/**
 * Match rendered text to stored leaves, block by block. A run is an element
 * with no child elements whose own text reads as exactly one leaf of its
 * block; the same leaf may render in several places (a menu shown twice), and
 * all of them are runs. A value stored under two paths is ambiguous and is
 * marked instead of made editable, so the wrong field can never be changed.
 */
export function findRuns(
    root: ParentNode,
    index: LeafIndex,
): { runs: Run[]; ambiguous: HTMLElement[] } {
    const runs: Run[] = [];
    const ambiguous: HTMLElement[] = [];
    for (const widget of Array.from(index.values())) {
        const container = root.querySelector<HTMLElement>(
            `[data-feedback-id="${escapeAttr(widget.widgetId)}"]`,
        );
        if (!container || !widget.byValue.size) continue;
        const elements = [
            container,
            ...Array.from(container.querySelectorAll<HTMLElement>("*")),
        ];
        for (const element of elements) {
            if (element.children.length || element.closest(skipped)) continue;
            const text = normalizeText(ownText(element));
            if (!text) continue;
            const paths = widget.byValue.get(text);
            if (!paths) continue;
            if (!element.getClientRects().length) continue;
            if (paths.length > 1) {
                ambiguous.push(element);
                continue;
            }
            const leaf = widget.byPath.get(paths[0])!;
            runs.push({
                element,
                widgetId: widget.widgetId,
                widgetName: widget.name,
                path: leaf.path,
                shared: widget.shared,
                kind: leaf.kind,
            });
        }
    }
    return { runs, ambiguous };
}

export function markRuns(
    found: { runs: Run[]; ambiguous: HTMLElement[] },
    copy: {
        runLabel: string;
        runHint: string;
        sharedHint: string;
        ambiguous: string;
    },
) {
    for (const run of found.runs) {
        const { element } = run;
        element.setAttribute(RUN_ATTR, run.path);
        element.setAttribute("data-kk-widget", run.widgetId);
        element.setAttribute("tabindex", "0");
        element.setAttribute("aria-label", copy.runLabel);
        element.setAttribute(
            "title",
            run.shared ? `${copy.sharedHint} · ${copy.runHint}` : copy.runHint,
        );
        if (run.shared) element.setAttribute("data-kk-shared", "");
    }
    for (const element of found.ambiguous) {
        element.setAttribute(AMBIGUOUS_ATTR, "");
        element.setAttribute("title", copy.ambiguous);
    }
}

export function unmarkRuns(root: ParentNode) {
    root.querySelectorAll<HTMLElement>(
        `[${RUN_ATTR}], [${AMBIGUOUS_ATTR}]`,
    ).forEach((element) => {
        for (const name of [
            RUN_ATTR,
            AMBIGUOUS_ATTR,
            "data-kk-widget",
            "data-kk-shared",
            "tabindex",
            "aria-label",
            "title",
        ])
            element.removeAttribute(name);
    });
}

/** Runs in document order, for Tab to step through. */
export function orderedRuns(runs: Run[]) {
    return [...runs].sort((a, b) =>
        a.element.compareDocumentPosition(b.element) &
        Node.DOCUMENT_POSITION_FOLLOWING
            ? -1
            : 1,
    );
}
