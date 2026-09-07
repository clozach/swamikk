import type { FeedbackTarget } from "@courselit/common-models";
import { feedbackUi as copy } from "@config/strings";

export interface PageSelection {
    element: HTMLElement | null;
    target: FeedbackTarget;
    label: string;
}

const excluded =
    "[data-feedback-ui], input, textarea, select, [contenteditable=true]";

export function pageSelection(path: string): PageSelection {
    return {
        element: null,
        label: copy.page,
        target: { kind: "page", path, componentId: "page", label: copy.page },
    };
}

function componentPath(element: HTMLElement): string {
    const parts: string[] = [];
    let current: HTMLElement | null = element;
    while (current && current !== document.body && parts.length < 8) {
        if (current.dataset.feedbackId || current.id) {
            parts.unshift(`#${current.dataset.feedbackId || current.id}`);
            break;
        }
        const siblings = current.parentElement
            ? Array.from(current.parentElement.children).filter(
                  (child) => child.tagName === current!.tagName,
              )
            : [];
        parts.unshift(
            `${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`,
        );
        current = current.parentElement;
    }
    return parts.join(" > ").slice(0, 500);
}

export function selectionFromElement(
    node: EventTarget | null,
    path: string,
): PageSelection | null {
    if (!(node instanceof HTMLElement) || node.closest(excluded)) return null;
    const element =
        node.closest<HTMLElement>("[data-feedback-lesson]") ||
        node.closest<HTMLElement>(
            "[data-feedback-id], section, article, main, div",
        );
    if (
        !element ||
        element === document.body ||
        element.closest("[data-feedback-ui]")
    )
        return null;
    const lesson = element.dataset.feedbackLesson;
    const label = (
        element.dataset.feedbackLabel ||
        element.getAttribute("aria-label") ||
        element.querySelector("h1,h2,h3,h4")?.textContent ||
        element.tagName.toLowerCase()
    )
        .trim()
        .slice(0, 120);
    const field = element.dataset.feedbackField;
    const target: FeedbackTarget =
        lesson && (field === "title" || field === "content")
            ? { kind: "lesson", lessonId: lesson, field }
            : {
                  kind: "page",
                  path,
                  componentId: componentPath(element),
                  label,
              };
    return { element, label, target };
}

export function pageChoices(path: string): PageSelection[] {
    const seen = new Set<string>();
    return [
        pageSelection(path),
        ...Array.from(
            document.querySelectorAll<HTMLElement>(
                "[data-feedback-id], [data-feedback-lesson], main, section, article",
            ),
        )
            .filter((element) => element.getClientRects().length > 0)
            .map((element) => selectionFromElement(element, path))
            .filter((selection): selection is PageSelection => {
                if (!selection) return false;
                const id = JSON.stringify(selection.target);
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            }),
    ];
}
