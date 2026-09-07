import { useEffect, useState, useSyncExternalStore } from "react";

export interface ViewportBounds {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** Fixed elements use layout coordinates; the visible viewport can pan within them. */
export function readVisualViewport(): ViewportBounds {
    const viewport = window.visualViewport;
    return {
        left: viewport?.offsetLeft ?? 0,
        top: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? window.innerWidth,
        height: viewport?.height ?? window.innerHeight,
    };
}

export function useVisualViewport() {
    const [bounds, setBounds] = useState<ViewportBounds | null>(null);
    useEffect(() => {
        const update = () => setBounds(readVisualViewport());
        const viewport = window.visualViewport;
        update();
        viewport?.addEventListener("resize", update);
        viewport?.addEventListener("scroll", update);
        window.addEventListener("resize", update);
        return () => {
            viewport?.removeEventListener("resize", update);
            viewport?.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, []);
    return bounds;
}

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** First hydration paint matches the server; subsequent portals use the stable body root. */
export function usePortalHost() {
    const mounted = useSyncExternalStore(
        subscribeToHydration,
        clientSnapshot,
        serverSnapshot,
    );
    return mounted ? document.body : null;
}
