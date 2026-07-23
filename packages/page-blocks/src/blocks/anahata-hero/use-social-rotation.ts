import { useEffect, useRef, useState } from "react";
import type { SocialHeroPhoto } from "@courselit/common-models";

/**
 * Client-side hero rotation over the server photo pool.
 *
 * Fetches `/api/social-hero/pool` once on mount. If the pool is disabled,
 * empty, or unreachable, `current` stays null and the caller shows the stored
 * static banner with NO credit.
 *
 * LOAD-VERIFIED: a photo only ever becomes `current` (and only ever paints
 * into a layer) AFTER its image has successfully preloaded. A photo that fails
 * to load is SKIPPED — never shown, never credited — so the visible image and
 * the overlay credit can never desync, and a broken URL can't strand the hero
 * on a mismatched caption. Two crossfading layers alternate; the timer pauses
 * while the tab is hidden; `prefers-reduced-motion` freezes rotation entirely
 * on the first loadable frame (see the dev plan's vestibular appendix).
 */

interface PoolResponse {
    enabled: boolean;
    rotationSeconds: number;
    photos: SocialHeroPhoto[];
}

export interface RotationState {
    /** Pool fetched, enabled, non-empty. */
    ready: boolean;
    layerA: string;
    layerB: string;
    /** Which layer is on top (opacity 1). */
    showA: boolean;
    /**
     * The photo currently SHOWN (loaded) on the visible layer, or null when
     * the static fallback is what's visible (nothing loaded yet / pool off).
     * The overlay credit renders iff this is non-null, so it always matches
     * the shown image.
     */
    current: SocialHeroPhoto | null;
}

export function useSocialRotation(active: boolean): RotationState {
    const [photos, setPhotos] = useState<SocialHeroPhoto[] | null>(null);
    const [rotationSeconds, setRotationSeconds] = useState(60);
    const [layerA, setLayerA] = useState("");
    const [layerB, setLayerB] = useState("");
    const [showA, setShowA] = useState(true);
    const [currentIdx, setCurrentIdx] = useState<number | null>(null);

    // Refs mirror the state the async timer reads, so the timer effect need
    // not restart on every swap.
    const showARef = useRef(true);
    const currentIdxRef = useRef<number | null>(null);
    // Cache successful loads so a shown image isn't re-fetched each tick.
    // Failures are NOT cached, so a transient error can recover on a later tick.
    const loadOk = useRef<Map<string, boolean>>(new Map());

    const preload = (src: string): Promise<boolean> =>
        new Promise((resolve) => {
            if (!src || typeof window === "undefined") {
                resolve(false);
                return;
            }
            if (loadOk.current.get(src)) {
                resolve(true);
                return;
            }
            const img = new Image();
            img.onload = () => {
                loadOk.current.set(src, true);
                resolve(true);
            };
            img.onerror = () => resolve(false);
            img.src = src;
        });

    // First loadable index at/after `start` (wrapping), or null if none load.
    const firstLoadable = async (
        list: SocialHeroPhoto[],
        start: number,
    ): Promise<number | null> => {
        for (let i = 0; i < list.length; i++) {
            const idx = (start + i) % list.length;
            // eslint-disable-next-line no-await-in-loop
            if (await preload(list[idx].src)) {
                return idx;
            }
        }
        return null;
    };

    useEffect(() => {
        if (!active) {
            return;
        }
        let cancelled = false;
        (async () => {
            let data: PoolResponse | null = null;
            try {
                const r = await fetch("/api/social-hero/pool");
                data = r.ok ? await r.json() : null;
            } catch {
                data = null;
            }
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
            // Show the first photo that actually loads; until then (and if none
            // load) currentIdx stays null → static fallback, no credit.
            const firstIdx = await firstLoadable(data.photos, 0);
            if (cancelled || firstIdx === null) {
                return;
            }
            setLayerA(data.photos[firstIdx].src);
            setShowA(true);
            showARef.current = true;
            setCurrentIdx(firstIdx);
            currentIdxRef.current = firstIdx;
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            return; // freeze on the first loadable frame
        }

        let timer: ReturnType<typeof setInterval> | undefined;
        let advancing = false;

        const advance = async () => {
            if (advancing) {
                return;
            }
            advancing = true;
            try {
                const start = (currentIdxRef.current ?? -1) + 1;
                const nextIdx = await firstLoadable(photos, start);
                // Nothing new loadable (all broken, or only one good photo) →
                // leave the current frame + credit exactly as they are.
                if (nextIdx === null || nextIdx === currentIdxRef.current) {
                    return;
                }
                const nextSrc = photos[nextIdx].src;
                if (showARef.current) {
                    setLayerB(nextSrc);
                } else {
                    setLayerA(nextSrc);
                }
                const nv = !showARef.current;
                setShowA(nv);
                showARef.current = nv;
                setCurrentIdx(nextIdx);
                currentIdxRef.current = nextIdx;
            } finally {
                advancing = false;
            }
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
        current: currentIdx !== null && photos ? photos[currentIdx] : null,
    };
}
