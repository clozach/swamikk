"use client";

import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { FONT_BODY } from "./tokens";

/* ------------------------------------------------------------------ *
 * Demo-walkthrough tracker — the "fake rock" behind the FAQ nav item.
 *
 * THROWAWAY internal tool: a faithful port of the approved standalone
 * prototype (design-explorations/faq/05-tutorial-tracker.html). It drives
 * the four-journey demo of the live site and is expected to be removed
 * later, so it is intentionally self-contained — one component, its own
 * scoped `<style>` (kk-tt- prefix), hard-coded palette hexes that match
 * ./tokens. It does NOT touch the block's sticky-band / spacer / sentinel
 * machinery; index.tsx anchors it absolutely below the header band.
 *
 * Interaction (verbatim from the prototype):
 *  - Four vertical name-spines packed left. Click a name to open its
 *    journey; the spines after it float right and its numbered steps fan
 *    out (dotted connector ↔ circle ↔ action label ↔ next circle).
 *  - Opening a name auto-closes the others. Click a circle to bring that
 *    step's label into focus; the rest collapse to just their circle.
 *  - Esc or a click away closes the whole tray (pointer-obvious dismissal).
 * ------------------------------------------------------------------ */

interface Journey {
    id: string;
    name: string;
    /** Each step is a small HTML fragment (may contain <code>…</code>),
     *  copied verbatim from the prototype and rendered as-is. Static,
     *  author-controlled content — no user input reaches this. */
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

/* Marker so the tray's own click-away handler ignores taps on the FAQ
   trigger button (which owns the open/close toggle) — the prototype's
   `faqBtn.contains(e.target)` guard, decoupled from a shared ref. The
   button in ./desktop-nav.tsx carries the same attribute. */
export const TRACKER_TRIGGER_ATTR = "data-kk-tt-trigger";

/* Scoped, throwaway styles. Prefix every selector with `.kk-tt-` so nothing
   leaks into the page. Hexes are the Anahata tokens (see ./tokens): rust
   #993300, rust-pressed #7a2900, cocoa #312110, saffron #ff9900, cream
   #f7f4eb, sand #efe9da, marigold #f6d36a, border-warm #9c7f52. Serif is the
   prototype's Playfair with graceful fallbacks; sans inherits FONT_BODY. */
const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif';
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

export default function TutorialTracker({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}): JSX.Element | null {
    // Which journey spine is expanded (id) or null; which step is active per
    // journey (defaults to 0). Matches the prototype: closing resets the open
    // journey but keeps each journey's last active step.
    const [openJourney, setOpenJourney] = useState<string | null>(null);
    const [activeStep, setActiveStep] = useState<Record<string, number>>({});
    const rootRef = useRef<HTMLDivElement | null>(null);

    // A closed tray starts collapsed again next time it opens.
    useEffect(() => {
        if (!open) {
            setOpenJourney(null);
        }
    }, [open]);

    // Pointer-obvious dismissal: a pointerdown outside the tray (and not on the
    // FAQ trigger, which owns the toggle) closes it; Esc closes and returns
    // focus to the trigger. Mirrors ./desktop-nav.tsx's outside-close idiom.
    useEffect(() => {
        if (!open || typeof document === "undefined") {
            return;
        }
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (rootRef.current?.contains(target)) {
                return;
            }
            if (
                target instanceof Element &&
                target.closest(`[${TRACKER_TRIGGER_ATTR}]`)
            ) {
                return;
            }
            onClose();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
                (
                    document.querySelector(
                        `[${TRACKER_TRIGGER_ATTR}]`,
                    ) as HTMLElement | null
                )?.focus();
            }
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open, onClose]);

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
            aria-label="Demo walkthrough tracker"
            style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                // Above ordinary page content; deliberately below the nav
                // flyouts / account menu (z-[10001]) so those still win.
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
                        <span className="kk-tt-tray-hint">
                            Esc or click away to close
                        </span>
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
