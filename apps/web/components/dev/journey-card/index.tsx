"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";

/* ------------------------------------------------------------------ *
 * Journey Card — the persistent, keyboard-summoned demo test-plan.
 *
 * DEV TOOL (durable, not throwaway). Grew out of the "fake rock" tutorial
 * tracker that hid behind the FAQ nav item; Al chose to double down and
 * make it a first-class dev tool. It drives the four-journey demo of the
 * live site and is meant to stay: a model session that ships UI-facing
 * work finishes by authoring/updating the Journey Card that walks it (see
 * the fork AGENTS.md § Journey Cards). Deliberately self-contained — one
 * component, its own scoped `<style>` (kk-tt- prefix), hard-coded Anahata
 * palette hexes — so it can be reasoned about and edited in one place.
 *
 * Mounted once, site-wide, as a sibling of MediaDebugOverlay in
 * app/(with-contexts)/layout.tsx — armed out-of-band, never a page element.
 *
 * Phase 0 (this commit): the tracker moved here verbatim and became a
 * self-managing no-prop client component (open state internal, default
 * closed). There is no opener yet — the Ctrl+Shift+J / ?jc=1 summon, the
 * sessionStorage persistence, and the band-above-nav presentation arrive
 * in Phase 1. Until then it renders nothing (closed), which is the intended
 * default-closed checkpoint.
 *
 * Interaction (from the approved prototype, unchanged this phase):
 *  - Four vertical name-spines packed left. Click a name to open its
 *    journey; the spines after it float right and its numbered steps fan
 *    out (dotted connector ↔ circle ↔ action label ↔ next circle).
 *  - Opening a name auto-closes the others. Click a circle to bring that
 *    step's label into focus; the rest collapse to just their circle.
 *  - Esc closes the whole tray.
 * ------------------------------------------------------------------ */

/* Inlined from the anahata-header block's ./tokens FONT_BODY — the
   --font-open-sans CSS var is applied app-wide (apps/web/lib/fonts.ts,
   wired in app/layout.tsx), so it resolves here too. */
const FONT_BODY =
    'var(--font-open-sans), "Open Sans", -apple-system, "Segoe UI", sans-serif';

interface Journey {
    id: string;
    name: string;
    /** Each step is a small HTML fragment (may contain <code>…</code>),
     *  copied verbatim from the prototype and rendered as-is. Static,
     *  author-controlled content — no user input reaches this. (Phase 2
     *  replaces these HTML strings with a typed segment registry.) */
    steps: string[];
}

const JOURNEYS: Journey[] = [
    {
        id: "jake",
        name: "Jake",
        steps: [
            "<code>Shop → All Products</code>",
            "Open the <code>$9 MP3</code>",
            "<code>Buy now</code>",
            "Email → <code>Continue</code>",
            "Code → <code>Verify OTP</code>",
            "<code>Complete Purchase</code>",
            "Card <code>4242 4242 4242 4242</code> (any date/CVC)",
            "<code>Download</code>",
        ],
    },
    {
        id: "april",
        name: "April",
        steps: [
            "Open <code>Building Resilience</code>",
            "<code>Enrol Now</code>",
            "Email → <code>Continue</code>",
            "Code → <code>Verify OTP</code>",
            "<code>Complete Purchase</code>",
            "Card <code>4242 4242 4242 4242</code> (any date/CVC)",
            "Open the course",
        ],
    },
    {
        id: "elana",
        name: "Elana",
        steps: [
            "Scroll to <code>Stay in Touch</code>",
            "Email → <code>Subscribe</code>",
            "See “you’re subscribed”",
            "Email footer → <code>Unsubscribe</code>",
            "Confirmed page",
        ],
    },
    {
        id: "karuna",
        name: "Karuna",
        steps: [
            "<code>/login</code> → <code>Get code</code>",
            "<code>Media</code> → <code>Upload</code>",
            "<code>Coupons</code> → new code",
            "<code>Subscribers</code> → Elana",
        ],
    },
];

/* Scoped styles. Prefix every selector with `.kk-tt-` so nothing leaks into
   the page. Hexes are the Anahata tokens: rust #993300, rust-pressed #7a2900,
   cocoa #312110, saffron #ff9900, cream #f7f4eb, sand #efe9da, marigold
   #f6d36a, border-warm #9c7f52. Serif is the app's Playfair via its next/font
   CSS var (a raw "Playfair Display" family does NOT resolve under next/font's
   hashed names — it would silently fall back to Georgia). */
const SERIF = 'var(--font-playfair-display), Georgia, "Times New Roman", serif';
const TRACKER_CSS = `
.kk-tt-root, .kk-tt-root *{ box-sizing:border-box; }
.kk-tt-root{ color:#545454; line-height:1.5; text-align:left; }
.kk-tt-tray{ max-width:1220px; margin:0 auto; }
.kk-tt-tray-inner{
  border-top:1px dashed #9c7f52;
  background:linear-gradient(180deg,#fffdf8,#f7f4eb);
  box-shadow:0 12px 24px rgba(0,0,0,0.12);
  animation:kk-tt-slide .28s ease;
}
@keyframes kk-tt-slide{ from{ opacity:0; transform:translateY(-6px); } to{ opacity:1; transform:none; } }
.kk-tt-tray-head{
  display:flex; align-items:baseline; gap:10px;
  padding:11px 22px 4px; max-width:1220px; margin:0 auto;
}
.kk-tt-tray-head h2{ font-family:${SERIF}; font-weight:700; font-size:15px; color:#993300; margin:0; }
.kk-tt-tray-head p{ margin:0; font-size:12px; color:#545454; }
.kk-tt-tray-hint{ margin-left:auto; font-size:11px; color:#8a7f6a; }
.kk-tt-rail{
  display:flex; align-items:stretch; gap:0; min-height:110px;
  padding:4px 16px 14px; max-width:1220px; margin:0 auto;
}
.kk-tt-spine{
  flex:0 0 auto; margin:0; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  background:none; border:0; padding:10px;
  color:#993300; font-family:${SERIF}; font-weight:700; font-size:20px;
  writing-mode:vertical-rl; text-orientation:mixed; letter-spacing:.04em;
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
.kk-tt-panel.kk-tt-active{ flex:1 1 auto; width:auto; opacity:1; padding:0 10px; overflow-x:auto; }
.kk-tt-steps{ display:flex; align-items:center; min-width:min-content; padding:6px 2px; }
.kk-tt-step{ display:flex; align-items:center; flex:none; }
.kk-tt-dot{
  flex:none; width:34px; height:34px; border-radius:50%; cursor:pointer;
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
.kk-tt-step.kk-tt-on .kk-tt-lab{ max-width:420px; opacity:1; }
.kk-tt-lab::before{ content:""; width:16px; border-top:2px dotted #9c7f52; flex:none; margin:0 6px; }
.kk-tt-txt{
  white-space:nowrap; font-size:13.5px; color:#312110; font-weight:600;
  background:#fff; border:1px solid #9c7f52; border-radius:8px; padding:7px 12px;
}
.kk-tt-txt code{
  font-family:ui-monospace,"SF Mono",Menlo,monospace; font-size:12px;
  background:#f6d36a; color:#312110; border-radius:4px; padding:1px 5px;
}
@media (prefers-reduced-motion: reduce){
  .kk-tt-root *{ transition:none !important; animation:none !important; }
}
`;

export default function JourneyCard(): JSX.Element | null {
    // Self-managed open state (Phase 0: default closed, no opener yet — the
    // summon lands in Phase 1). Which journey spine is expanded (id) or null;
    // which step is active per journey (defaults to 0). Closing resets the
    // open journey but keeps each journey's last active step — the per-journey
    // memory the sessionStorage schema will preserve in Phase 1.
    const [open, setOpen] = useState(false);
    const [openJourney, setOpenJourney] = useState<string | null>(null);
    const [activeStep, setActiveStep] = useState<Record<string, number>>({});
    const rootRef = useRef<HTMLDivElement | null>(null);

    // Closing collapses the open journey (so it starts fresh next time) but
    // keeps each journey's last active step — the per-journey memory the
    // Phase-1 sessionStorage schema preserves. Done here in the close handler,
    // not a reactive effect (there is only one close path this phase).
    const close = useCallback(() => {
        setOpen(false);
        setOpenJourney(null);
    }, []);

    // Esc closes the tray while it is open. (Phase 1 replaces this with the
    // codebase's uniform open-only Esc handling + the compare-tool bail-out
    // precedence; the click-away handler is dropped there — the card persists
    // while you interact with the page.)
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
        return () => {
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open, close]);

    if (!open) {
        return null;
    }

    const toggleJourney = (id: string) =>
        setOpenJourney((current) => (current === id ? null : id));
    const selectStep = (id: string, index: number) => {
        setOpenJourney(id);
        setActiveStep((current) => ({ ...current, [id]: index }));
    };

    return (
        <div
            ref={rootRef}
            className="kk-tt-root"
            role="region"
            aria-label="Journey Card — demo walkthrough"
            style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                // Phase 1 raises this to the fixed band-above-nav treatment;
                // for now the tray is never opened, so positioning is inert.
                zIndex: 30,
                fontFamily: FONT_BODY,
            }}
        >
            <style>{TRACKER_CSS}</style>
            <div className="kk-tt-tray">
                <div className="kk-tt-tray-inner">
                    <div className="kk-tt-tray-head">
                        <h2>The demo walkthrough</h2>
                        <p>
                            Pick a traveller, then step through their journey on
                            the live site.
                        </p>
                        <span className="kk-tt-tray-hint">Esc to close</span>
                    </div>
                    <div className="kk-tt-rail">
                        {JOURNEYS.map((journey) => {
                            const isOpen = openJourney === journey.id;
                            const active = activeStep[journey.id] ?? 0;
                            return (
                                <React.Fragment key={journey.id}>
                                    <button
                                        type="button"
                                        className="kk-tt-spine"
                                        aria-expanded={isOpen}
                                        onClick={() =>
                                            toggleJourney(journey.id)
                                        }
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
                                            {journey.steps.map(
                                                (step, index) => (
                                                    <React.Fragment key={index}>
                                                        <div
                                                            className={clsx(
                                                                "kk-tt-step",
                                                                isOpen &&
                                                                    index ===
                                                                        active &&
                                                                    "kk-tt-on",
                                                            )}
                                                        >
                                                            <button
                                                                type="button"
                                                                className="kk-tt-dot"
                                                                aria-label={`Step ${
                                                                    index + 1
                                                                }`}
                                                                tabIndex={
                                                                    isOpen
                                                                        ? 0
                                                                        : -1
                                                                }
                                                                onClick={() =>
                                                                    selectStep(
                                                                        journey.id,
                                                                        index,
                                                                    )
                                                                }
                                                            >
                                                                {index + 1}
                                                            </button>
                                                            <div className="kk-tt-lab">
                                                                <span
                                                                    className="kk-tt-txt"
                                                                    // Static, author-authored copy from the
                                                                    // prototype (contains <code> spans); no
                                                                    // user input is ever interpolated here.
                                                                    dangerouslySetInnerHTML={{
                                                                        __html: step,
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                        {index <
                                                            journey.steps
                                                                .length -
                                                                1 && (
                                                            <div className="kk-tt-link" />
                                                        )}
                                                    </React.Fragment>
                                                ),
                                            )}
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
