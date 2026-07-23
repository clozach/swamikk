"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { JOURNEYS, type Journey, type JourneyStep, type Seg } from "./journeys";
import { executeAuto } from "./automation";

/* ------------------------------------------------------------------ *
 * Journey Card — the persistent, keyboard-summoned demo test-plan.
 *
 * DEV TOOL (durable, not throwaway). Grew out of the "fake rock" tutorial
 * tracker that hid behind the FAQ nav item; Al chose to double down and make
 * it a first-class dev tool. It drives the four-journey demo of the live site
 * and is meant to stay: a model session that ships UI-facing work finishes by
 * authoring/updating the Journey Card that walks it (see the fork AGENTS.md
 * § Journey Cards). Deliberately self-contained — one component, its own
 * scoped `<style>` (kk-tt- prefix), hard-coded Anahata palette hexes.
 *
 * Mounted once, site-wide, as a sibling of MediaDebugOverlay in
 * app/(with-contexts)/layout.tsx — armed out-of-band, never a page element.
 *
 * Phase 1 (this commit): summon + persistence + band presentation.
 *  - Summon: Ctrl+Shift+J (keyboard; unclaimed — the app's only global chord
 *    is Cmd/Ctrl+K for the dashboard sidebar; macOS DevTools is Cmd+Opt+J, and
 *    the Windows-Chrome Ctrl+Shift+J collision is irrelevant on this Mac rig).
 *    Touch has no chord, so `?jc=1` in the URL arms it (mirrors
 *    MediaDebugOverlay's ?mediadebug=1). The struck FAQ item is gone for good.
 *  - Persistence: sessionStorage (key kk-journey-card:v1), parse-at-boundary
 *    hydration, SSR-safe first paint (first render is always closed/default;
 *    storage is read only in a mount effect, like media-debug-overlay.tsx).
 *    Per-journey step memory: switching journeys never forgets the others.
 *  - Presentation: a fixed band ACROSS THE TOP of the viewport, ABOVE the
 *    site nav, that PUSHES the nav and page down (ResizeObserver-measured
 *    --jc-band-height → body padding-top; the anahata header pins below it via
 *    tokens.ts STICKY_HEADER_BAND_FIXED). It never masks page content.
 *    Dismiss: ✕ (top-right) or Esc. No click-away — the card persists while
 *    you interact with the page.
 *
 * Phase 2 (this commit): the journey data moved to ./journeys.ts as a typed
 * registry (segments, not HTML strings — no dangerouslySetInnerHTML), with
 * stable per-step ids that sessionStorage keys on.
 *
 * Phase 3 (this commit): click a focused step's label to "do it for me"
 * (automation.ts). An automatable label renders as a button with a ▶ hint;
 * a `manual` step renders hands-on (never clickable) with a ✋ hint + its
 * `why` as a tooltip. navigate advances-then-assigns (persisting the next
 * step synchronously so the card re-hydrates already advanced on the next
 * page); a missed selector flashes the label; copy shows a transient note.
 * ------------------------------------------------------------------ */

const STORAGE_KEY = "kk-journey-card:v1";
/** CSS var the band publishes so the page (and the pinned header) move down. */
const BAND_HEIGHT_VAR = "--jc-band-height";

/* Inlined from the anahata-header block's ./tokens FONT_BODY — the
   --font-open-sans CSS var is applied app-wide (apps/web/lib/fonts.ts). */
const FONT_BODY =
    'var(--font-open-sans), "Open Sans", -apple-system, "Segoe UI", sans-serif';

/* --- persisted state: a keyed record, not parallel nullables ------------- */
type StoredState = {
    v: 1;
    open: boolean;
    openJourneyId: string | null; // which journey is expanded (null = none)
    stepByJourney: Record<string, string>; // journeyId -> active stepId
};

const DEFAULT_STATE: StoredState = {
    v: 1,
    open: false,
    openJourneyId: null,
    stepByJourney: {},
};

/** Parse-at-boundary hydration: malformed / wrong-version → defaults; unknown
 *  journey or step ids are dropped (that journey resumes at its start). The
 *  rest of the component then trusts the shape. */
function hydrate(raw: string | null): StoredState {
    if (!raw) {
        return DEFAULT_STATE;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return DEFAULT_STATE;
    }
    if (
        typeof parsed !== "object" ||
        parsed === null ||
        (parsed as { v?: unknown }).v !== 1
    ) {
        return DEFAULT_STATE;
    }
    const p = parsed as Partial<StoredState>;
    const journeyIds = new Set(JOURNEYS.map((j) => j.id));

    const openJourneyId =
        typeof p.openJourneyId === "string" && journeyIds.has(p.openJourneyId)
            ? p.openJourneyId
            : null;

    const stepByJourney: Record<string, string> = {};
    if (p.stepByJourney && typeof p.stepByJourney === "object") {
        for (const journey of JOURNEYS) {
            const stepId = (p.stepByJourney as Record<string, unknown>)[
                journey.id
            ];
            if (
                typeof stepId === "string" &&
                journey.steps.some((s) => s.id === stepId)
            ) {
                stepByJourney[journey.id] = stepId;
            }
        }
    }

    return {
        v: 1,
        open: p.open === true,
        openJourneyId,
        stepByJourney,
    };
}

/* Scoped styles. Prefix every selector with `.kk-tt-` so nothing leaks into the
   page. Anahata tokens: rust #993300, rust-pressed #7a2900, cocoa #312110,
   saffron #ff9900, cream #f7f4eb, sand #efe9da, marigold #f6d36a, border-warm
   #9c7f52. Serif is the app's Playfair via its next/font CSS var (a raw
   "Playfair Display" family does NOT resolve under next/font's hashed names). */
const SERIF = 'var(--font-playfair-display), Georgia, "Times New Roman", serif';
const BAND_Z = 2147483000; // above the pinned header; below MediaDebugOverlay
const TRACKER_CSS = `
.kk-tt-root, .kk-tt-root *{ box-sizing:border-box; }
.kk-tt-root{
  position:fixed; top:0; left:0; right:0; z-index:${BAND_Z};
  color:#545454; line-height:1.5; text-align:left; font-family:${FONT_BODY};
  padding-top:env(safe-area-inset-top);
  background:linear-gradient(180deg,#fffdf8,#f7f4eb);
  border-bottom:1px dashed #9c7f52;
  box-shadow:0 8px 20px rgba(0,0,0,0.14);
  animation:kk-tt-slide .28s ease;
}
@keyframes kk-tt-slide{ from{ opacity:0; transform:translateY(-100%); } to{ opacity:1; transform:none; } }
.kk-tt-tray-head{
  display:flex; align-items:baseline; gap:10px;
  padding:9px 22px 2px; max-width:1220px; margin:0 auto;
}
.kk-tt-tray-head h2{ font-family:${SERIF}; font-weight:700; font-size:15px; color:#993300; margin:0; }
.kk-tt-tray-head p{ margin:0; font-size:12px; color:#545454; }
.kk-tt-tray-hint{ margin-left:auto; font-size:11px; color:#8a7f6a; }
.kk-tt-close{
  flex:none; width:26px; height:26px; margin-left:6px; cursor:pointer;
  border:1px solid #9c7f52; border-radius:6px; background:#fff; color:#993300;
  font-size:15px; line-height:1; display:flex; align-items:center; justify-content:center;
  transition:background .16s ease, color .16s ease;
}
.kk-tt-close:hover{ background:#efe9da; color:#7a2900; }
.kk-tt-close:focus-visible{ outline:2px solid #993300; outline-offset:2px; }
.kk-tt-rail{
  display:flex; align-items:stretch; gap:0; min-height:66px;
  padding:2px 16px 10px; max-width:1220px; margin:0 auto;
}
.kk-tt-spine{
  flex:0 0 auto; margin:0; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  background:none; border:0; padding:6px 12px;
  color:#993300; font-family:${SERIF}; font-weight:700; font-size:19px;
  letter-spacing:.02em; white-space:nowrap;
  transition:color .18s ease;
}
.kk-tt-spine:hover{ color:#7a2900; text-decoration:underline; }
.kk-tt-spine:focus-visible{ outline:2px solid #993300; outline-offset:2px; border-radius:4px; }
.kk-tt-spine[aria-expanded="true"]{ color:#312110; box-shadow:inset 3px 0 0 #ff9900; }
.kk-tt-panel{
  flex:0 0 0; width:0; overflow:hidden; opacity:0;
  display:flex; align-items:center;
  transition:flex-grow .32s ease, opacity .28s ease;
}
.kk-tt-panel.kk-tt-active{ flex:1 1 auto; width:auto; opacity:1; padding:0 8px; overflow-x:auto; }
.kk-tt-steps{ display:flex; align-items:center; min-width:min-content; padding:4px 2px; }
.kk-tt-step{ display:flex; align-items:center; flex:none; }
.kk-tt-dot{
  flex:none; width:32px; height:32px; border-radius:50%; cursor:pointer;
  border:2px solid #993300; background:#fff; color:#993300;
  font-family:inherit; font-weight:700; font-size:14px;
  display:flex; align-items:center; justify-content:center;
  transition:background .18s ease, color .18s ease, transform .18s ease;
}
.kk-tt-dot:hover{ background:#efe9da; }
.kk-tt-dot:focus-visible{ outline:2px solid #993300; outline-offset:2px; }
.kk-tt-step.kk-tt-on .kk-tt-dot{ background:#ff9900; border-color:#d97a00; color:#312110; transform:scale(1.06); }
.kk-tt-link{ flex:none; width:12px; border-top:2px dotted #9c7f52; }
.kk-tt-lab{
  display:flex; align-items:center; max-width:0; overflow:hidden; opacity:0;
  transition:max-width .3s ease, opacity .26s ease;
}
.kk-tt-step.kk-tt-on .kk-tt-lab{ max-width:460px; opacity:1; }
.kk-tt-lab::before{ content:""; width:16px; border-top:2px dotted #9c7f52; flex:none; margin:0 6px; }
.kk-tt-txt{
  white-space:nowrap; font-size:13.5px; color:#312110; font-weight:600;
  background:#fff; border:1px solid #9c7f52; border-radius:8px; padding:6px 12px;
}
.kk-tt-txt code{
  font-family:ui-monospace,"SF Mono",Menlo,monospace; font-size:12px;
  background:#f6d36a; color:#312110; border-radius:4px; padding:1px 5px;
}
/* Interactive label (automatable step): a button wrapping the chip + a ▶ hint. */
.kk-tt-run{
  display:inline-flex; align-items:center; gap:7px; cursor:pointer;
  background:none; border:0; padding:0; font:inherit; color:inherit;
}
.kk-tt-run .kk-tt-txt{ transition:background .16s ease, border-color .16s ease; }
.kk-tt-run:hover .kk-tt-txt, .kk-tt-run:focus-visible .kk-tt-txt{ background:#fff8e6; border-color:#d97a00; }
.kk-tt-run:focus-visible{ outline:2px solid #993300; outline-offset:2px; border-radius:8px; }
.kk-tt-hint{
  flex:none; font-size:10px; font-weight:700; letter-spacing:.03em;
  color:#7a2900; background:#f6d36a; border-radius:999px; padding:2px 7px; white-space:nowrap;
}
.kk-tt-run:hover .kk-tt-hint, .kk-tt-run:focus-visible .kk-tt-hint{ background:#ffbf00; }
/* Manual step: hands-on, deliberately NOT button-like. */
.kk-tt-manual{ display:inline-flex; align-items:center; gap:7px; cursor:default; }
.kk-tt-hint-manual{
  flex:none; font-size:10px; font-weight:700; color:#8a7f6a;
  background:#efe9da; border-radius:999px; padding:2px 7px; white-space:nowrap;
}
/* Missed-selector flash. */
@keyframes kk-tt-miss{ 0%,100%{ background:#fff; } 30%,60%{ background:#ffd9cf; border-color:#c0392b; } }
.kk-tt-miss .kk-tt-txt{ animation:kk-tt-miss .6s ease; }
/* Transient "copied" note in the head. */
.kk-tt-note{
  margin-left:10px; font-size:11px; font-weight:700; color:#312110;
  background:#f6d36a; border-radius:999px; padding:2px 10px; white-space:nowrap;
  animation:kk-tt-slide .2s ease;
}
@media (prefers-reduced-motion: reduce){
  .kk-tt-root *, .kk-tt-root{ transition:none !important; animation:none !important; }
}
`;

/** Render a step label's segments — no dangerouslySetInnerHTML. */
function StepLabel({ label }: { label: Seg[] }): JSX.Element {
    return (
        <span className="kk-tt-txt">
            {label.map((seg, i) =>
                seg.kind === "code" ? (
                    <code key={i}>{seg.text}</code>
                ) : (
                    <React.Fragment key={i}>{seg.text}</React.Fragment>
                ),
            )}
        </span>
    );
}

export default function JourneyCard(): JSX.Element | null {
    // SSR-safe: first render is ALWAYS the closed default; sessionStorage is
    // read only in the mount effect below (hydration-mismatch guard, exactly
    // like media-debug-overlay.tsx).
    const [state, setState] = useState<StoredState>(DEFAULT_STATE);
    // Transient "do it for me" feedback: a step whose selector missed (flash),
    // and a short-lived note (e.g. "copied"). Neither is persisted.
    const [missStepId, setMissStepId] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const hydratedRef = useRef(false);
    const bandRef = useRef<HTMLDivElement | null>(null);
    const noteTimer = useRef<number | undefined>(undefined);
    const missTimer = useRef<number | undefined>(undefined);

    const { open, openJourneyId, stepByJourney } = state;

    // --- hydrate from sessionStorage + honour ?jc=1 (touch summon) ---------
    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }
        const stored = hydrate(window.sessionStorage.getItem(STORAGE_KEY));
        const armedByUrl =
            new URLSearchParams(window.location.search).get("jc") === "1";
        // Query string + sessionStorage are client-only, so this necessarily
        // runs post-mount — the SSR-safe hydration pattern (same as
        // media-debug-overlay.tsx). First paint was the closed default.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState(armedByUrl ? { ...stored, open: true } : stored);
        hydratedRef.current = true;
    }, []);

    // --- write-through (skip the pre-hydration default paint) --------------
    useEffect(() => {
        if (!hydratedRef.current || typeof window === "undefined") {
            return;
        }
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, [state]);

    const close = useCallback(() => {
        // Dismiss keeps openJourney/step memory so re-summoning resumes.
        setState((s) => ({ ...s, open: false }));
    }, []);

    // --- Ctrl+Shift+J summon: one always-bound window listener --------------
    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (
                event.ctrlKey &&
                event.shiftKey &&
                !event.altKey &&
                !event.metaKey &&
                (event.key === "J" || event.key === "j") &&
                !event.defaultPrevented
            ) {
                event.preventDefault();
                setState((s) => ({ ...s, open: !s.open }));
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    // --- Esc dismiss, bound only while open --------------------------------
    // NOTE: the /checkout compare-tool easter egg's Escape bail-out is a bare
    // window keydown that does not preventDefault, so both may fire if it is
    // active — an accepted double-dismiss (journey-card-dev-plan §3.2).
    useEffect(() => {
        if (!open || typeof document === "undefined") {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !event.defaultPrevented) {
                close();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open, close]);

    // --- push, don't mask: publish the band's real height as a CSS var so the
    // body padding + the pinned header both move down; clear it on close. -----
    useEffect(() => {
        const root = document.documentElement;
        if (
            !open ||
            !bandRef.current ||
            typeof ResizeObserver === "undefined"
        ) {
            root.style.removeProperty(BAND_HEIGHT_VAR);
            return;
        }
        const band = bandRef.current;
        const measure = () =>
            root.style.setProperty(
                BAND_HEIGHT_VAR,
                `${Math.ceil(band.getBoundingClientRect().height)}px`,
            );
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(band);
        return () => {
            ro.disconnect();
            root.style.removeProperty(BAND_HEIGHT_VAR);
        };
    }, [open, openJourneyId]);

    // Clear the transient-feedback timers on unmount.
    useEffect(
        () => () => {
            window.clearTimeout(noteTimer.current);
            window.clearTimeout(missTimer.current);
        },
        [],
    );

    if (!open) {
        return null;
    }

    const toggleJourney = (id: string) =>
        setState((s) => ({
            ...s,
            openJourneyId: s.openJourneyId === id ? null : id,
        }));
    const selectStep = (journeyId: string, stepId: string) =>
        setState((s) => ({
            ...s,
            openJourneyId: journeyId,
            stepByJourney: { ...s.stepByJourney, [journeyId]: stepId },
        }));

    const flashMiss = (stepId: string) => {
        window.clearTimeout(missTimer.current);
        setMissStepId(stepId);
        missTimer.current = window.setTimeout(
            () => setMissStepId((c) => (c === stepId ? null : c)),
            650,
        );
    };
    const showNote = (text: string) => {
        window.clearTimeout(noteTimer.current);
        setNote(text);
        noteTimer.current = window.setTimeout(() => setNote(null), 1800);
    };

    // "Do it for me": run the focused step's auto, then advance. A step's
    // side-effect can navigate the page (a buy-now/enrol-now <a>, or Complete
    // Purchase → Stripe), so we persist the advance to sessionStorage BEFORE
    // running it and roll back if the selector missed (a miss never navigates).
    // That way the card re-hydrates on the next page already advanced — the
    // whole cross-page trick, no orchestration needed.
    const runAuto = (journey: Journey, step: JourneyStep) => {
        if (step.auto.kind === "manual") {
            return;
        }
        const idx = journey.steps.findIndex((s) => s.id === step.id);
        const nextStep = journey.steps[idx + 1] ?? null;
        const advanced: StoredState = {
            v: 1,
            open: true,
            openJourneyId: journey.id,
            stepByJourney: {
                ...stepByJourney,
                [journey.id]: nextStep ? nextStep.id : step.id,
            },
        };
        const prev = window.sessionStorage.getItem(STORAGE_KEY);
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(advanced));

        const outcome = executeAuto(step.auto);
        if (outcome.kind === "miss") {
            // Nothing fired — undo the optimistic advance, flash the label, and
            // SAY why (an unexplained no-op reads as a dead button). A miss here
            // almost always means the target control isn't in the page's current
            // state — e.g. the checkout email field is absent when you're already
            // signed in, so the fill/click has nothing to act on.
            if (prev === null) {
                window.sessionStorage.removeItem(STORAGE_KEY);
            } else {
                window.sessionStorage.setItem(STORAGE_KEY, prev);
            }
            flashMiss(step.id);
            showNote("Nothing to do here — you may already be past this step");
            return;
        }
        setState(advanced);
        if (outcome.kind === "copy") {
            showNote(outcome.note ? `Copied — ${outcome.note}` : "Copied");
        } else if (outcome.kind === "navigate") {
            window.location.assign(outcome.href);
        }
    };

    return (
        <>
            {/* The push: everything in normal flow drops by the band height;
                nothing is covered. Gentle, reduced-motion-aware. */}
            <style>{`
                body{ padding-top:var(${BAND_HEIGHT_VAR},0px); }
                @media (prefers-reduced-motion: no-preference){
                    body{ transition:padding-top .28s ease; }
                }
            `}</style>
            <div
                ref={bandRef}
                className="kk-tt-root"
                role="region"
                aria-label="Journey Card — demo walkthrough"
            >
                <style>{TRACKER_CSS}</style>
                <div className="kk-tt-tray-head">
                    <h2>The demo walkthrough</h2>
                    <p>
                        Pick a traveller, then step through their journey on the
                        live site.
                    </p>
                    {note && <span className="kk-tt-note">{note}</span>}
                    <span className="kk-tt-tray-hint">
                        Ctrl+Shift+J · Esc to close
                    </span>
                    <button
                        type="button"
                        className="kk-tt-close"
                        aria-label="Close Journey Card"
                        onClick={close}
                    >
                        ✕
                    </button>
                </div>
                <div className="kk-tt-rail">
                    {JOURNEYS.map((journey) => {
                        const isOpen = openJourneyId === journey.id;
                        const activeStepId =
                            stepByJourney[journey.id] ?? journey.steps[0]?.id;
                        return (
                            <React.Fragment key={journey.id}>
                                <button
                                    type="button"
                                    className="kk-tt-spine"
                                    aria-expanded={isOpen}
                                    onClick={() => toggleJourney(journey.id)}
                                >
                                    {journey.name}
                                </button>
                                <div
                                    className={clsx(
                                        "kk-tt-panel",
                                        isOpen && "kk-tt-active",
                                    )}
                                    aria-hidden={!isOpen}
                                >
                                    <div className="kk-tt-steps">
                                        {journey.steps.map((step, index) => {
                                            const isActive =
                                                isOpen &&
                                                step.id === activeStepId;
                                            const automatable =
                                                step.auto.kind !== "manual";
                                            return (
                                                <React.Fragment key={step.id}>
                                                    <div
                                                        className={clsx(
                                                            "kk-tt-step",
                                                            isActive &&
                                                                "kk-tt-on",
                                                            missStepId ===
                                                                step.id &&
                                                                "kk-tt-miss",
                                                        )}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="kk-tt-dot"
                                                            aria-label={`Step ${
                                                                index + 1
                                                            }`}
                                                            tabIndex={
                                                                isOpen ? 0 : -1
                                                            }
                                                            onClick={() =>
                                                                selectStep(
                                                                    journey.id,
                                                                    step.id,
                                                                )
                                                            }
                                                        >
                                                            {index + 1}
                                                        </button>
                                                        <div className="kk-tt-lab">
                                                            {isActive &&
                                                            automatable ? (
                                                                <button
                                                                    type="button"
                                                                    className="kk-tt-run"
                                                                    title="Do this step for me"
                                                                    onClick={() =>
                                                                        runAuto(
                                                                            journey,
                                                                            step,
                                                                        )
                                                                    }
                                                                >
                                                                    <StepLabel
                                                                        label={
                                                                            step.label
                                                                        }
                                                                    />
                                                                    <span className="kk-tt-hint">
                                                                        ▶ do it
                                                                    </span>
                                                                </button>
                                                            ) : isActive &&
                                                              step.auto.kind ===
                                                                  "manual" ? (
                                                                <span
                                                                    className="kk-tt-manual"
                                                                    title={
                                                                        step
                                                                            .auto
                                                                            .why
                                                                    }
                                                                >
                                                                    <StepLabel
                                                                        label={
                                                                            step.label
                                                                        }
                                                                    />
                                                                    <span className="kk-tt-hint-manual">
                                                                        ✋
                                                                        hands-on
                                                                    </span>
                                                                </span>
                                                            ) : (
                                                                <StepLabel
                                                                    label={
                                                                        step.label
                                                                    }
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                    {index <
                                                        journey.steps.length -
                                                            1 && (
                                                        <div className="kk-tt-link" />
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
