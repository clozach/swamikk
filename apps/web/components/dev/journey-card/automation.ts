/* ------------------------------------------------------------------ *
 * Journey Card — "do it for me" executor (Phase 3).
 *
 * Pure DOM side-effects only. It performs the automatable half of a step
 * (click / fill / copy) and REPORTS what should happen next; it deliberately
 * does NOT navigate or touch React/sessionStorage — index.tsx owns those, so
 * it can persist the step advance synchronously BEFORE a navigation unloads
 * the page (the whole cross-page trick: the card re-hydrates on the next page
 * already showing the next step).
 *
 * Hard limits are encoded as `manual` in journeys.ts (OTP from a real inbox,
 * the Stripe-hosted card entry, the secret-token unsubscribe, native file
 * pickers) — those never reach here as an automatable action.
 * ------------------------------------------------------------------ */

import type { StepAuto } from "./journeys";

export type AutoOutcome =
    | { kind: "ok" } // side-effect done, advance to the next step
    | { kind: "navigate"; href: string } // caller must persist-then-navigate
    | { kind: "copy"; note?: string } // clipboard done, advance + show a note
    | { kind: "manual" } // not automatable; do nothing
    | { kind: "miss" }; // selector matched nothing visible; flash the label

/** An element counts as actionable only if it is actually on screen — several
 *  controls render twice (e.g. the desktop + mobile Complete Purchase). */
function firstVisible(selector: string): HTMLElement | null {
    const nodes = document.querySelectorAll<HTMLElement>(selector);
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.offsetParent !== null) {
            return node;
        }
    }
    return null;
}

/** Controlled inputs (RHF and plain useState) ignore a bare `.value =`; drive
 *  them through the native setter + a bubbling input event. */
function setControlledValue(
    input: HTMLInputElement | HTMLTextAreaElement,
    value: string,
): void {
    const proto =
        input instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function executeAuto(auto: StepAuto): AutoOutcome {
    switch (auto.kind) {
        case "manual":
            return { kind: "manual" };

        case "navigate":
            // The caller advances + persists, then assigns — not us.
            return { kind: "navigate", href: auto.href };

        case "click": {
            const el = firstVisible(auto.selector);
            if (!el) {
                return { kind: "miss" };
            }
            el.click();
            return { kind: "ok" };
        }

        case "fill": {
            const input = firstVisible(auto.selector);
            if (
                !(input instanceof HTMLInputElement) &&
                !(input instanceof HTMLTextAreaElement)
            ) {
                return { kind: "miss" };
            }
            setControlledValue(input, auto.value);
            if (auto.thenClickSelector) {
                firstVisible(auto.thenClickSelector)?.click();
            }
            return { kind: "ok" };
        }

        case "copy": {
            try {
                // Inside the click gesture, secure context (localhost + https).
                void navigator.clipboard?.writeText(auto.text);
            } catch {
                /* clipboard blocked — the note still guides a manual copy */
            }
            return { kind: "copy", note: auto.note };
        }
    }
}
