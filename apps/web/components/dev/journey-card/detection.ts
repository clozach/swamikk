/* ------------------------------------------------------------------ *
 * Journey Card — detection (the guide-follows-you half).
 *
 * Pure evaluation: given a journey, its frontier step, and the current
 * location, decide how far the world's evidence advances the card. No DOM
 * writes, no React, no storage — index.tsx owns when to run a sweep (its
 * five triggers + the activation baseline) and what to do with the result.
 *
 * Frontier-only, forward-only, structurally bounded: only the frontier
 * step's detector is ever evaluated; while it fires and a next step exists,
 * hop forward and re-evaluate the NEW frontier against the same world. A
 * satisfied LATER step can never vault the card over unperformed
 * intermediates, because non-frontier steps are never consulted. Stops at
 * the first unsatisfied detector or `kind: "none"`; never advances past the
 * last step.
 * ------------------------------------------------------------------ */

import type { DetectScope, Journey, JourneyStep, StepDone } from "./journeys";
import { firstVisible } from "./automation";

export interface Loc {
    pathname: string;
    search: string;
}

/** Trailing-slash-insensitive pathname normalization ("/" stays "/"). */
function normalize(path: string): string {
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export function scopeMatches(scope: DetectScope, loc: Loc): boolean {
    const path = normalize(loc.pathname);
    if (scope.at === "path-prefix") {
        return path.startsWith(normalize(scope.path));
    }
    if (path !== normalize(scope.path)) {
        return false;
    }
    if (scope.query) {
        const params = new URLSearchParams(loc.search);
        for (const [key, value] of Object.entries(scope.query)) {
            if (params.get(key) !== value) {
                return false;
            }
        }
    }
    return true;
}

/** Is this step's outcome in effect right now? Out-of-scope → false (the
 *  step waits — a designed false negative, never an error). */
export function isDoneNow(done: StepDone, loc: Loc): boolean {
    switch (done.kind) {
        case "none":
            return false;
        case "path":
            return scopeMatches(done.scope, loc);
        case "dom":
            // Same visibility rule as "do it" (automation.ts firstVisible) —
            // one source of truth, so detection and "do it" cannot disagree.
            return (
                scopeMatches(done.scope, loc) &&
                firstVisible(done.selector) !== null
            );
    }
}

export interface SweepResult {
    /** Steps completed by this sweep, in order (possibly empty). */
    completed: JourneyStep[];
    /** The new frontier step id (unchanged if nothing completed). */
    frontierId: string;
}

export function sweepFrontier(
    journey: Journey,
    frontierId: string,
    loc: Loc,
): SweepResult {
    const completed: JourneyStep[] = [];
    let index = journey.steps.findIndex((s) => s.id === frontierId);
    if (index < 0) {
        return { completed, frontierId };
    }
    // Hard cap steps.length - 1 hops; the `index < length - 1` bound also
    // means the LAST step never "completes" — the card never walks off the
    // end of a journey.
    while (
        index < journey.steps.length - 1 &&
        completed.length < journey.steps.length - 1
    ) {
        const step = journey.steps[index];
        if (!isDoneNow(step.done, loc)) {
            break;
        }
        completed.push(step);
        index += 1;
    }
    return { completed, frontierId: journey.steps[index].id };
}
