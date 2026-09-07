"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaPlaybackState } from "@courselit/common-models";

let activeMedia: HTMLMediaElement | null = null;

export function useMediaPlayback(src: string, exclusive: boolean) {
    const mediaRef = useRef<HTMLMediaElement | null>(null);
    const [state, setState] = useState<MediaPlaybackState>({
        playing: false,
        currentTime: 0,
        duration: 0,
        muted: false,
        rate: 1,
        failed: false,
    });

    useEffect(() => {
        const media = mediaRef.current;
        if (!media) return;
        // Strict Mode can replay cleanup; restore the same element's source.
        if (!media.getAttribute("src")) media.src = src;
        const sync = () => {
            setState({
                playing: !media.paused && !media.ended,
                currentTime: media.currentTime,
                duration: Number.isFinite(media.duration) ? media.duration : 0,
                muted: media.muted,
                rate: media.playbackRate,
                failed: Boolean(media.error),
            });
        };
        const claim = () => {
            if (exclusive) {
                if (activeMedia && activeMedia !== media) activeMedia.pause();
                activeMedia = media;
            }
            sync();
        };
        const events = [
            "pause",
            "ended",
            "timeupdate",
            "durationchange",
            "loadedmetadata",
            "volumechange",
            "ratechange",
            "error",
            "emptied",
        ];
        events.forEach((event) => media.addEventListener(event, sync));
        media.addEventListener("play", claim);
        sync();
        return () => {
            events.forEach((event) => media.removeEventListener(event, sync));
            media.removeEventListener("play", claim);
            if (activeMedia === media) activeMedia = null;
            media.pause();
            media.removeAttribute("src");
            media.load();
        };
    }, [src, exclusive]);

    const toggle = async () => {
        const media = mediaRef.current;
        if (!media) return;
        if (!media.paused) return media.pause();
        try {
            await media.play();
        } catch {
            setState((previous) => ({
                ...previous,
                playing: false,
                failed: true,
            }));
        }
    };
    const seek = (value: number) => {
        const media = mediaRef.current;
        if (media && Number.isFinite(media.duration)) {
            media.currentTime = Math.min(media.duration, Math.max(0, value));
        }
    };
    return { mediaRef, state, toggle, seek };
}
