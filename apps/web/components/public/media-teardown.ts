"use client";

// Attach as `ref={mediaTeardownRef}` on any <video>/<audio> to guarantee its
// audio actually stops when the element goes away. Safari neither pauses a
// media element that leaves the DOM nor reliably keeps it paused across a
// back-forward-cache restore (it has been observed reviving a detached,
// already-paused element's audio when returning from Stripe checkout).
//
// On detach (React 19 ref cleanup): pause, then fully release the media
// resource (clear src and <source> children, call load()) so there is nothing
// left to resume. While attached: one module-level listener pair pauses every
// registered element on pagehide (before the bfcache freeze) and again on
// pageshow with persisted=true (defensive, for Safari's wrongful resumes).
//
// Handles any number of elements per page. Same strategy as
// packages/page-blocks/src/components/video-with-preview.tsx and
// components/public/lesson-viewer/index.tsx, which inline a single-element
// version (page-blocks cannot import from apps/web).

const active = new Set<HTMLMediaElement>();
let listenersArmed = false;

function pauseAll() {
    active.forEach((m) => {
        if (!m.paused) {
            try {
                m.pause();
            } catch {
                // ignore — nothing to stop
            }
        }
    });
}

function armListeners() {
    if (listenersArmed || typeof window === "undefined") return;
    listenersArmed = true;
    window.addEventListener("pagehide", pauseAll);
    window.addEventListener("pageshow", (e: PageTransitionEvent) => {
        if (e.persisted) pauseAll();
    });
}

export function mediaTeardownRef(node: HTMLMediaElement | null) {
    if (!node) return;
    armListeners();
    active.add(node);
    return () => {
        active.delete(node);
        try {
            node.pause();
            node.removeAttribute("src");
            while (node.firstChild) node.removeChild(node.firstChild);
            node.load();
        } catch {
            // element already gone — nothing to stop
        }
    };
}
