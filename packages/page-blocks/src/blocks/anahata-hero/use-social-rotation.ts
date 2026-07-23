import { useEffect, useRef, useState } from "react";
import type { SocialHeroPhoto } from "@courselit/common-models";

/**
 * Client-side hero rotation over the server photo pool.
 *
 * Fetches `/api/social-hero/pool` once on mount. If the pool is disabled,
 * empty, or unreachable, `ready` stays false and the caller renders the stored
 * static banner — the hero is never blank or broken by a feed outage. Two
 * crossfading layers (A/B) alternate: the next image is PRELOADED and only
 * swapped in on load, so a half-loaded hero never paints. The timer pauses
 * while the tab is hidden, and `prefers-reduced-motion` freezes rotation
 * entirely on frame 0 (see the dev plan's appendix on vestibular sensitivity).
 */

interface PoolResponse {
    enabled: boolean;
    rotationSeconds: number;
    photos: SocialHeroPhoto[];
}

export interface RotationState {
    /** Pool fetched, enabled, non-empty — safe to show rotation layers. */
    ready: boolean;
    layerA: string;
    layerB: string;
    /** Which layer is on top (opacity 1). */
    showA: boolean;
    /** Current photo, for the overlay button + aria-label. */
    current: SocialHeroPhoto | null;
}

export function useSocialRotation(active: boolean): RotationState {
    const [photos, setPhotos] = useState<SocialHeroPhoto[] | null>(null);
    const [rotationSeconds, setRotationSeconds] = useState(60);
    const [idx, setIdx] = useState(0);
    const [layerA, setLayerA] = useState("");
    const [layerB, setLayerB] = useState("");
    const [showA, setShowA] = useState(true);

    // Refs mirror the state the interval callback reads, so the timer effect
    // doesn't need to tear down and restart on every crossfade.
    const idxRef = useRef(0);
    const showARef = useRef(true);

    useEffect(() => {
        if (!active) {
            return;
        }
        let cancelled = false;
        fetch("/api/social-hero/pool")
            .then((r) => (r.ok ? r.json() : null))
            .then((data: PoolResponse | null) => {
                if (
                    cancelled ||
                    !data ||
                    !data.enabled ||
                    !Array.isArray(data.photos) ||
                    data.photos.length === 0
                ) {
                    return;
                }
                setPhotos(data.photos);
                setRotationSeconds(
                    typeof data.rotationSeconds === "number" &&
                        data.rotationSeconds >= 1
                        ? data.rotationSeconds
                        : 60,
                );
                setLayerA(data.photos[0].src);
                setShowA(true);
                showARef.current = true;
                setIdx(0);
                idxRef.current = 0;
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [active]);

    useEffect(() => {
        if (!active || !photos || photos.length < 2) {
            return;
        }
        const reduced =
            typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduced) {
            // Freeze entirely on frame 0 — no timer, no swap, no fade.
            return;
        }

        let timer: ReturnType<typeof setInterval> | undefined;

        const advance = () => {
            const next = (idxRef.current + 1) % photos.length;
            const nextSrc = photos[next].src;
            const swap = () => {
                // Paint the next image into the hidden layer, then flip.
                if (showARef.current) {
                    setLayerB(nextSrc);
                } else {
                    setLayerA(nextSrc);
                }
                setShowA((v) => {
                    const nv = !v;
                    showARef.current = nv;
                    return nv;
                });
                idxRef.current = next;
                setIdx(next);
            };
            const img = new Image();
            img.onload = swap;
            // Advance even on error so a single bad image can't stall rotation.
            img.onerror = swap;
            img.src = nextSrc;
        };

        const start = () => {
            if (!timer) {
                timer = setInterval(advance, rotationSeconds * 1000);
            }
        };
        const stop = () => {
            if (timer) {
                clearInterval(timer);
                timer = undefined;
            }
        };
        const onVisibility = () => {
            if (document.hidden) {
                stop();
            } else {
                start();
            }
        };

        if (!document.hidden) {
            start();
        }
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            stop();
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [active, photos, rotationSeconds]);

    return {
        ready: !!photos && photos.length > 0,
        layerA,
        layerB,
        showA,
        current: photos ? photos[idx] : null,
    };
}
