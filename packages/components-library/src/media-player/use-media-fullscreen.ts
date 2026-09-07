"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { NativeFullscreenVideo } from "@courselit/common-models";

function isLandscape() {
    return screen.orientation?.type
        ? screen.orientation.type.startsWith("landscape")
        : window.matchMedia("(orientation: landscape)").matches;
}

export function useMediaFullscreen(
    mediaRef: RefObject<HTMLMediaElement | null>,
    allowed: boolean,
) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [fullscreen, setFullscreen] = useState(false);
    const [unavailable, setUnavailable] = useState(false);
    const pending = useRef(false);
    const allowedRef = useRef(allowed);
    allowedRef.current = allowed;

    const exit = useCallback(async () => {
        const video = mediaRef.current as NativeFullscreenVideo | null;
        try {
            if (document.fullscreenElement === wrapperRef.current) {
                await document.exitFullscreen();
            } else if (video?.webkitDisplayingFullscreen) {
                video.webkitExitFullscreen?.();
            }
        } catch {
            // Keep the browser's Exit control available if it rejects our request.
        }
    }, [mediaRef]);

    const enter = useCallback(
        async (manual: boolean) => {
            const wrapper = wrapperRef.current;
            const video = mediaRef.current as NativeFullscreenVideo | null;
            if (
                !allowed ||
                !wrapper ||
                !video ||
                pending.current ||
                document.fullscreenElement ||
                video.webkitDisplayingFullscreen
            )
                return;
            pending.current = true;
            try {
                if (
                    wrapper.requestFullscreen &&
                    document.fullscreenEnabled !== false
                ) {
                    await wrapper.requestFullscreen();
                    // An orientation request may settle after the phone has
                    // rotated back or the route has entered Member Mimic.
                    if (
                        (!manual && !isLandscape()) ||
                        !allowedRef.current ||
                        !wrapper.isConnected
                    ) {
                        if (document.fullscreenElement === wrapper)
                            await document.exitFullscreen();
                    }
                } else if (manual && video.webkitEnterFullscreen) {
                    // iPhone native fullscreen is a user-gesture fallback only.
                    video.webkitEnterFullscreen();
                } else {
                    setUnavailable(true);
                    return;
                }
                setUnavailable(false);
            } catch {
                setUnavailable(true);
            } finally {
                pending.current = false;
            }
        },
        [allowed, mediaRef],
    );

    useEffect(() => {
        const video = mediaRef.current as NativeFullscreenVideo | null;
        const sync = () =>
            setFullscreen(
                document.fullscreenElement === wrapperRef.current ||
                    Boolean(video?.webkitDisplayingFullscreen),
            );
        document.addEventListener("fullscreenchange", sync);
        video?.addEventListener("webkitbeginfullscreen", sync);
        video?.addEventListener("webkitendfullscreen", sync);
        return () => {
            document.removeEventListener("fullscreenchange", sync);
            video?.removeEventListener("webkitbeginfullscreen", sync);
            video?.removeEventListener("webkitendfullscreen", sync);
        };
    }, [mediaRef]);

    useEffect(() => {
        if (!allowed) {
            void exit();
            return;
        }
        let wasLandscape = isLandscape();
        const rotate = () => {
            const nowLandscape = isLandscape();
            const media = mediaRef.current;
            if (nowLandscape === wasLandscape) return;
            wasLandscape = nowLandscape;
            if (!nowLandscape) void exit();
            else if (media && !media.paused && !media.ended) void enter(false);
        };
        // Physical orientation events, not resizing a desktop window.
        screen.orientation?.addEventListener("change", rotate);
        window.addEventListener("orientationchange", rotate);
        return () => {
            screen.orientation?.removeEventListener("change", rotate);
            window.removeEventListener("orientationchange", rotate);
        };
    }, [allowed, enter, exit, mediaRef]);

    return { wrapperRef, fullscreen, unavailable, enter, exit };
}
