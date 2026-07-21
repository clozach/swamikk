"use client";

// The "easter egg" that reveals a page's design-exploration compare tool.
//
//   idle   → draw 3 circles          → egg      (the pointer becomes a
//                                                 decorated egg)
//   egg    → click anywhere          → compare  (the compare tool fills the
//                                                 screen; the egg hatches into
//                                                 a colour-matched chick whose
//                                                 beak tip is the pointer)
//   compare→ draw 3 circles          → chicken  (the chick grows into a full
//                                                 hen)
//   chicken→ click anywhere          → idle     (the compare tool closes)
//
// Only mounts on pages that actually have a compare tool (checkout; the
// Building Resilience page). Escape bails out from any state. The custom
// cursor is set as the page default so real hover styles (hand over links,
// I-beam over inputs) still win — only the arrow is replaced.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    CompareContext,
    PALETTES,
    chickCursor,
    eggCursor,
    henCursor,
} from "./art";
import { LoopDetector } from "./loop-detector";

type Phase = "idle" | "egg" | "compare" | "chicken";

// which bundled compare tool each page reveals (served from /public/easter-eggs)
const TOPIC: Record<CompareContext, string> = {
    checkout: "download-checkout",
    resilience: "resilience",
};

export default function CompareTool({ context }: { context: CompareContext }) {
    const [phase, setPhase] = useState<Phase>("idle");
    const phaseRef = useRef<Phase>("idle");
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const wiredDocs = useRef<WeakSet<Document>>(new WeakSet());
    const summonRef = useRef<LoopDetector | null>(null);
    const dismissRef = useRef<LoopDetector | null>(null);

    const cursors = useMemo(() => {
        const p = PALETTES[context];
        return { egg: eggCursor(p), chick: chickCursor(p), hen: henCursor(p) };
    }, [context]);

    const go = useCallback((p: Phase) => {
        phaseRef.current = p;
        // start every state with fresh gesture accumulators so a leftover
        // sweep from a prior circle can't shorten the next one
        summonRef.current?.reset();
        dismissRef.current?.reset();
        // synchronous phase mirror, dev/e2e observability only (stripped in prod)
        if (
            process.env.NODE_ENV !== "production" &&
            typeof window !== "undefined"
        )
            (window as unknown as { __comparePhase?: Phase }).__comparePhase =
                p;
        setPhase(p);
    }, []);

    const cursorFor = useCallback(
        (p: Phase): string =>
            p === "egg"
                ? cursors.egg
                : p === "chicken"
                  ? cursors.hen
                  : p === "compare"
                    ? cursors.chick
                    : "",
        [cursors],
    );

    const onMove = useCallback((x: number, y: number) => {
        const t =
            typeof performance !== "undefined" ? performance.now() : Date.now();
        const ph = phaseRef.current;
        if (ph === "idle" || ph === "egg") summonRef.current?.feed(x, y, t);
        else dismissRef.current?.feed(x, y, t);
    }, []);

    const onClick = useCallback(
        (e: { preventDefault(): void; stopPropagation(): void }) => {
            const ph = phaseRef.current;
            if (ph === "egg") {
                e.preventDefault();
                e.stopPropagation();
                go("compare");
            } else if (ph === "chicken") {
                e.preventDefault();
                e.stopPropagation();
                go("idle");
            }
        },
        [go],
    );

    // one-time wiring of the page-level detectors + window listeners
    useEffect(() => {
        summonRef.current = new LoopDetector(() => {
            if (phaseRef.current === "idle") go("egg");
        });
        dismissRef.current = new LoopDetector(() => {
            if (phaseRef.current === "compare") go("chicken");
        });

        const mm = (e: MouseEvent) => onMove(e.clientX, e.clientY);
        // capture phase so an armed click is intercepted before page handlers
        const ck = (e: MouseEvent) => onClick(e);
        const kd = (e: KeyboardEvent) => {
            if (e.key === "Escape" && phaseRef.current !== "idle") go("idle");
        };
        window.addEventListener("mousemove", mm);
        window.addEventListener("click", ck, true);
        window.addEventListener("keydown", kd);
        return () => {
            window.removeEventListener("mousemove", mm);
            window.removeEventListener("click", ck, true);
            window.removeEventListener("keydown", kd);
            document.documentElement.style.cursor = "";
            document.body.style.cursor = "";
            document.body.style.overflow = "";
        };
    }, [go, onMove, onClick]);

    // inject the current cursor into the same-origin compare iframe (its own
    // hover styles still win via lower specificity on its buttons/links)
    const applyIframeCursor = useCallback((cur: string) => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;
        let st = doc.getElementById("__ceg_cursor") as HTMLStyleElement | null;
        if (!st) {
            st = doc.createElement("style");
            st.id = "__ceg_cursor";
            (doc.head || doc.documentElement).appendChild(st);
        }
        st.textContent = cur ? `html,body{cursor:${cur} !important}` : "";
    }, []);

    // reflect the phase onto the real cursor + scroll lock
    useEffect(() => {
        const cur = cursorFor(phase);
        document.documentElement.style.cursor = cur;
        document.body.style.cursor = cur;
        document.body.style.overflow =
            phase === "compare" || phase === "chicken" ? "hidden" : "";
        if (phase === "compare" || phase === "chicken") applyIframeCursor(cur);
    }, [phase, cursorFor, applyIframeCursor]);

    // wire the compare iframe on load: cursor + its own move/click listeners
    // (once the overlay is up, pointer events land in the iframe, not window)
    const wireIframe = useCallback(() => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;
        applyIframeCursor(cursorFor(phaseRef.current));
        if (wiredDocs.current.has(doc)) return;
        wiredDocs.current.add(doc);
        doc.addEventListener(
            "mousemove",
            (e) => onMove((e as MouseEvent).clientX, (e as MouseEvent).clientY),
            true,
        );
        doc.addEventListener("click", (e) => onClick(e as MouseEvent), true);
        // Escape must still bail out once focus is inside the iframe — the
        // parent window's keydown listener never sees keys typed in the frame.
        doc.addEventListener("keydown", (e) => {
            if ((e as KeyboardEvent).key === "Escape") go("idle");
        });
    }, [applyIframeCursor, cursorFor, onMove, onClick, go]);

    if (phase !== "compare" && phase !== "chicken") return null;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 2147483647,
                background: "#000",
            }}
        >
            <iframe
                ref={iframeRef}
                onLoad={wireIframe}
                src={`/easter-eggs/${TOPIC[context]}/compare.html`}
                title="Design exploration — compare"
                style={{
                    width: "100%",
                    height: "100%",
                    border: 0,
                    display: "block",
                }}
            />
        </div>
    );
}
