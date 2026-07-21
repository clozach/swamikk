"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Stop a lesson's video/audio when it's torn down — switching lessons,
 * navigating away, or Safari's back-forward cache. Safari keeps a
 * detached/frozen media element playing, so without this a guided-practice
 * audio track would keep going after you leave the page or bounce Back.
 *
 * Returns a callback ref to attach to the <audio>/<video> element. The ref
 * fires with null the instant the element detaches (full resource release);
 * the pagehide handler covers the bfcache freeze. One hook instance guards
 * one media element — components that render several players (e.g. a
 * multi-file download product) instantiate it once per player.
 *
 * Extracted verbatim from lesson-viewer (2026-07-17 Safari ghost-audio fix)
 * so the lean download viewer and the course viewer share one implementation.
 */
export function useMediaTeardown() {
    const activeMediaRef = useRef<HTMLMediaElement | null>(null);
    const setMediaRef = useCallback((node: HTMLMediaElement | null) => {
        if (node === null && activeMediaRef.current) {
            const m = activeMediaRef.current;
            try {
                // Pausing is not enough in Safari: a bfcache restore can
                // revive a detached element's audio (see video-with-preview).
                // Fully release the media resource — this element renders its
                // source via <source> children, so clear those too.
                m.pause();
                m.removeAttribute("src");
                while (m.firstChild) m.removeChild(m.firstChild);
                m.load();
            } catch {
                // element already gone — nothing to stop
            }
        }
        activeMediaRef.current = node;
    }, []);
    useEffect(() => {
        const stopPlayback = () => {
            const m = activeMediaRef.current;
            if (m && !m.paused) {
                try {
                    m.pause();
                } catch {
                    // ignore — nothing to stop
                }
            }
        };
        const onPageShow = (e: PageTransitionEvent) => {
            if (e.persisted) stopPlayback();
        };
        window.addEventListener("pagehide", stopPlayback);
        window.addEventListener("pageshow", onPageShow);
        return () => {
            window.removeEventListener("pagehide", stopPlayback);
            window.removeEventListener("pageshow", onPageShow);
        };
    }, []);
    return setMediaRef;
}
