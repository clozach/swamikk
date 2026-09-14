import { normalizeText, type LeafIndex } from "./leaves";

/**
 * How a run maps back to the store:
 * - `text`: the element's own text is one string leaf (edited as plain text);
 * - `linked-text`: a paragraph whose text is one leaf and whose single link
 *   is the sibling `linkText` leaf (the hero's shape) — edited with the link
 *   kept in place, written back as two leaves;
 * - `rich-node`: a rich-text paragraph or heading with formatting inside —
 *   edited with the formatting kept, written back as one node.
 */
export type RunKind = "text" | "linked-text" | "rich-node";
export interface Run {
    element: HTMLElement;
    widgetId: string;
    widgetName: string;
    shared: boolean;
    kind: RunKind;
    /** The leaf path (text), the `.text` leaf (linked-text), or the node path (rich-node). */
    path: string;
    /** linked-text only: the sibling `linkText` leaf. */
    linkPath?: string;
}

export const RUN_ATTR = "data-kk-editable";
export const AMBIGUOUS_ATTR = "data-kk-ambiguous";
const skipped =
    "[data-feedback-ui], script, style, noscript, template, svg, input, textarea, select, option, [contenteditable=true], [contenteditable=plaintext-only]";
/** Inline elements the editor can write back as marks (or see through). */
const richTags = new Set([
    "STRONG",
    "B",
    "EM",
    "I",
    "S",
    "STRIKE",
    "DEL",
    "U",
    "CODE",
    "A",
    "BR",
    "SUP",
    "SPAN",
]);
const markByTag: Record<string, string> = {
    STRONG: "bold",
    B: "bold",
    EM: "italic",
    I: "italic",
    S: "strike",
    STRIKE: "strike",
    DEL: "strike",
    U: "underline",
    CODE: "code",
};

/** The element's own text: its direct text nodes, in order. */
export function ownText(element: Element) {
    let text = "";
    element.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue || "";
    });
    return text;
}

/** Markup the renderer adds around words: the ↗ cue, screen-reader-only notes, line breaks. */
export const isDecoration = (element: Element) =>
    element.tagName === "BR" ||
    element.tagName === "SUP" ||
    element.classList.contains("sr-only") ||
    element.hasAttribute("hidden");
const isHiddenNote = (element: Element) =>
    element.classList.contains("sr-only") || element.hasAttribute("hidden");

/**
 * The words an element shows, the way the stored text reads them: a line
 * break per `<br>`, the renderer's `<sup>↗</sup>` external-link cue rejoined
 * as " ↗" (or left out), and screen-reader-only notes left out.
 */
export function visibleText(
    element: Element,
    { arrows = true }: { arrows?: boolean } = {},
): string {
    let text = "";
    element.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue || "";
        else if (node instanceof Element) {
            if (node.tagName === "BR") text += "\n";
            else if (node.tagName === "SUP") {
                if (arrows) text += ` ${(node.textContent || "").trim()}`;
            } else if (isHiddenNote(node)) return;
            else text += visibleText(node, { arrows });
        }
    });
    return text;
}

/** A stored label without the external-link cue the renderer adds back. */
export const stripArrow = (text: string) => text.replace(/\s*↗\s*$/, "");

/** The text nodes that carry words (not the ↗ cue, not screen-reader notes), in order. */
export function contentTextNodes(element: Element): Text[] {
    const out: Text[] = [];
    element.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) out.push(node as Text);
        else if (
            node instanceof Element &&
            node.tagName !== "SUP" &&
            !isHiddenNote(node)
        )
            out.push(...contentTextNodes(node));
    });
    return out;
}

const escapeAttr = (value: string) =>
    typeof CSS !== "undefined" && CSS.escape
        ? CSS.escape(value)
        : value.replace(/["\\]/g, "\\$&");

const supportedRich = (element: Element) =>
    Array.from(element.querySelectorAll("*")).every((child) =>
        richTags.has(child.tagName),
    );
const scopeOf = (run: Run) =>
    run.kind === "rich-node"
        ? run.path
        : run.kind === "linked-text"
          ? run.path.replace(/\.text$/, "")
          : null;
const within = (path: string, scope: string | null) =>
    !!scope && (path === scope || path.startsWith(`${scope}.`));
const unique = (paths: string[] | undefined) =>
    paths?.length === 1 ? paths[0] : undefined;

/**
 * Match rendered text to stored leaves, block by block. An element whose
 * children are only decoration is a text run when its visible text reads as
 * exactly one leaf. An element with real children is a rich-node run when its
 * visible text reads as one rich-text paragraph/heading and every child is
 * formatting the editor can keep, or a linked-text run when it reads as one
 * leaf whose single link is the sibling link words. Duplicated renders (a
 * menu shown twice) are all runs of one leaf; a value stored under two paths
 * is ambiguous and is marked, not made editable, so the wrong field can never
 * be changed. Inside a compound run the parts are not runs of their own, and
 * the same node matched by an element and a wrapper inside it keeps the outer.
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
        if (!container || (!widget.byValue.size && !widget.byNodeValue.size))
            continue;
        const candidates: Run[] = [];
        const elements = [
            container,
            ...Array.from(container.querySelectorAll<HTMLElement>("*")),
        ];
        const base = {
            widgetId: widget.widgetId,
            widgetName: widget.name,
            shared: widget.shared,
        };
        for (const element of elements) {
            if (element.closest(skipped)) continue;
            const withArrows = normalizeText(visibleText(element));
            const withoutArrows = normalizeText(
                visibleText(element, { arrows: false }),
            );
            if (!withArrows || !element.getClientRects().length) continue;
            const children = Array.from(element.children);
            // Words alone, or words with only the renderer's decoration around them.
            if (children.every(isDecoration)) {
                const paths =
                    widget.byValue.get(withArrows) ||
                    widget.byValue.get(withoutArrows);
                if (paths && paths.length > 1) {
                    ambiguous.push(element);
                    continue;
                }
                if (paths) {
                    candidates.push({
                        ...base,
                        element,
                        kind: "text",
                        path: paths[0],
                    });
                    continue;
                }
                if (!children.length) continue;
            }
            const nodePaths =
                widget.byNodeValue.get(withArrows) ||
                widget.byNodeValue.get(withoutArrows);
            if (nodePaths?.length === 1 && supportedRich(element)) {
                candidates.push({
                    ...base,
                    element,
                    kind: "rich-node",
                    path: nodePaths[0],
                });
                continue;
            }
            if (nodePaths && nodePaths.length > 1) {
                ambiguous.push(element);
                continue;
            }
            const leafPath =
                unique(widget.byValue.get(withArrows)) ||
                unique(widget.byValue.get(withoutArrows));
            if (!leafPath?.endsWith(".text")) continue;
            const linkPath = leafPath.replace(/\.text$/, ".linkText");
            const link = widget.byPath.get(linkPath);
            const anchors = element.querySelectorAll("a");
            if (
                link &&
                anchors.length === 1 &&
                normalizeText(visibleText(anchors[0], { arrows: false })) ===
                    normalizeText(stripArrow(link.value))
            )
                candidates.push({
                    ...base,
                    element,
                    kind: "linked-text",
                    path: leafPath,
                    linkPath,
                });
        }
        for (const run of candidates) {
            const dominated = candidates.some(
                (other) =>
                    other !== run &&
                    ((other.path === run.path &&
                        other.element !== run.element &&
                        other.element.contains(run.element)) ||
                        (other.kind !== "text" &&
                            other.path !== run.path &&
                            other.element.contains(run.element) &&
                            within(run.path, scopeOf(other)))),
            );
            if (!dominated) runs.push(run);
        }
    }
    return { runs, ambiguous };
}

export function markRuns(
    found: { runs: Run[]; ambiguous: HTMLElement[] },
    copy: {
        runLabel: string;
        runHint: string;
        richHint: string;
        sharedHint: string;
        ambiguous: string;
    },
) {
    for (const run of found.runs) {
        const { element } = run;
        element.setAttribute(RUN_ATTR, run.path);
        element.setAttribute("data-kk-widget", run.widgetId);
        element.setAttribute("data-kk-kind", run.kind);
        element.setAttribute("tabindex", "0");
        element.setAttribute("aria-label", copy.runLabel);
        const hint = run.kind === "text" ? copy.runHint : copy.richHint;
        element.setAttribute(
            "title",
            run.shared ? `${copy.sharedHint} · ${hint}` : hint,
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
            "data-kk-kind",
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

type Mark = { type: string; attrs?: Record<string, unknown> };
export type RichNode = {
    type: string;
    attrs?: Record<string, unknown>;
    marks?: Mark[];
    text?: string;
    content?: RichNode[];
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
const stable = (value: unknown): string =>
    Array.isArray(value)
        ? `[${value.map(stable).join(",")}]`
        : isRecord(value)
          ? `{${Object.keys(value)
                .sort()
                .filter((key) => value[key] !== undefined)
                .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
                .join(",")}}`
          : (JSON.stringify(value) ?? "null");

/** The stored order of mark types, so a rebuilt node compares equal to its source. */
function markOrder(before: RichNode): string[] {
    const order: string[] = [];
    const visit = (node: RichNode) => {
        for (const mark of node.marks || [])
            if (!order.includes(mark.type)) order.push(mark.type);
        for (const child of node.content || []) visit(child);
    };
    visit(before);
    return order;
}
const sortMarks = (marks: Mark[], order: string[]) =>
    [...marks].sort((a, b) => {
        const ia = order.indexOf(a.type);
        const ib = order.indexOf(b.type);
        if (ia !== ib) return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
        return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
    });
/** Marks sorted by type, so two nodes that differ only in mark order compare equal. */
function canonical(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(canonical);
    if (!isRecord(node)) return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node))
        out[key] =
            key === "marks" && Array.isArray(value)
                ? sortMarks(value as Mark[], []).map(canonical)
                : canonical(value);
    return out;
}

/** The link mark the stored node already uses for this address, so its target/rel survive a rewrite. */
function storedLinkMark(before: RichNode, href: string): Mark {
    const find = (node: RichNode): Mark | undefined => {
        for (const mark of node.marks || [])
            if (mark.type === "link" && mark.attrs?.href === href) return mark;
        for (const child of node.content || []) {
            const found = find(child);
            if (found) return found;
        }
        return undefined;
    };
    return find(before) || { type: "link", attrs: { href } };
}

/**
 * Read an edited paragraph/heading back into the stored TipTap shape: text
 * nodes in order, each carrying the marks of the inline elements around it
 * in the stored order; `<br>` as a hard break (marked like its neighbours);
 * the renderer's `<sup>↗</sup>` cue rejoined into the link's text. Wrappers
 * the renderer adds (`<span>`) are seen through.
 */
export function domToNode(element: Element, before: unknown): RichNode {
    const original = (
        isRecord(before) ? before : { type: "paragraph" }
    ) as RichNode;
    const order = markOrder(original);
    const out: RichNode[] = [];
    const stamp = (marks: Mark[]) =>
        marks.length
            ? sortMarks(marks, order).map((mark) => ({ ...mark }))
            : undefined;
    const push = (text: string, marks: Mark[]) => {
        if (!text) return;
        const last = out[out.length - 1];
        const stamped = stamp(marks);
        if (
            last &&
            last.type === "text" &&
            stable(last.marks) === stable(stamped)
        )
            last.text = (last.text || "") + text;
        else
            out.push({
                type: "text",
                text,
                ...(stamped ? { marks: stamped } : {}),
            });
    };
    const walk = (node: Node, marks: Mark[]) => {
        node.childNodes.forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE)
                push((child.nodeValue || "").replace(/\u00a0/g, " "), marks);
            else if (child instanceof Element) {
                const tag = child.tagName;
                if (tag === "BR") {
                    const stamped = stamp(marks);
                    out.push({
                        type: "hardBreak",
                        ...(stamped ? { marks: stamped } : {}),
                    });
                } else if (tag === "SUP")
                    push(` ${(child.textContent || "").trim()}`, marks);
                else if (isHiddenNote(child)) return;
                else if (tag === "A") {
                    const href = child.getAttribute("href") || "";
                    walk(child, [...marks, storedLinkMark(original, href)]);
                } else if (markByTag[tag])
                    walk(child, [...marks, { type: markByTag[tag] }]);
                else walk(child, marks);
            }
        });
    };
    walk(element, []);
    // A browser leaves a trailing break behind an edited block; the store never keeps one.
    if (out.length && out[out.length - 1].type === "hardBreak") out.pop();
    return {
        type: original.type,
        ...(original.attrs ? { attrs: original.attrs } : {}),
        content: out,
    };
}

export const sameNode = (a: unknown, b: unknown) =>
    stable(canonical(a)) === stable(canonical(b));

/** The words of each text node of a rich node, in order (for writing a saved node back into a run). */
export function nodeTextSequence(node: unknown): string[] {
    if (!isRecord(node)) return [];
    if (node.type === "text")
        return [typeof node.text === "string" ? node.text : ""];
    return Array.isArray(node.content)
        ? node.content.flatMap(nodeTextSequence)
        : [];
}
