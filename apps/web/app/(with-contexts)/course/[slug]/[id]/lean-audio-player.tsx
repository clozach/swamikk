"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@components/ui/button";
import { useMediaTeardown } from "@components/public/use-media-teardown";

function formatTime(totalSeconds: number | null): string {
    if (
        totalSeconds === null ||
        !Number.isFinite(totalSeconds) ||
        totalSeconds < 0
    ) {
        return "--:--";
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const mmss = `${minutes}:${seconds.toString().padStart(2, "0")}`;
    return hours > 0
        ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
              .toString()
              .padStart(2, "0")}`
        : mmss;
}

/**
 * A minimal audio player with page-native controls (Al, 2026-07-21). The
 * browser's built-in player draws its controls inside UA shadow DOM on an
 * unstylable gray pill that no amount of host CSS reliably clears across
 * browsers — so the <audio> here is headless and the controls are ordinary
 * page elements: they ARE embedded in the page rather than appearing to be.
 *
 * The media src is a time-limited presigned URL; if it expires while the
 * page sits open, playback errors surface as a visible message steering the
 * listener to refresh or use the download button (whose server-side proxy
 * mints a fresh URL per request and never goes stale).
 */
export default function LeanAudioPlayer({ src }: { src?: string }) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const teardownRef = useMediaTeardown();
    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [duration, setDuration] = useState<number | null>(null);
    const [current, setCurrent] = useState(0);
    const [scrubbing, setScrubbing] = useState(false);
    const [errored, setErrored] = useState(false);

    // Stable identity is load-bearing: an inline ref callback would change
    // identity every render, making React cycle it null→node each time —
    // and the teardown hook treats null as "element detached" and strips
    // the source from the LIVE element.
    const setRefs = useCallback(
        (node: HTMLAudioElement | null) => {
            audioRef.current = node;
            teardownRef(node);
        },
        [teardownRef],
    );

    // Defense in depth for the same hazard: if anything ever strips the
    // attribute behind React's back (the teardown on a spurious detach),
    // restore it — setting src re-runs the load algorithm.
    useEffect(() => {
        const audio = audioRef.current;
        if (audio && src && audio.getAttribute("src") !== src) {
            audio.src = src;
        }
    });

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        if (audio.paused || audio.ended) {
            audio.play().catch(() => {
                // No source, or the presigned URL expired underneath us —
                // make the failure visible instead of a dead button.
                setErrored(true);
                setPlaying(false);
            });
        } else {
            audio.pause();
        }
    };

    const toggleMute = () => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        audio.muted = !audio.muted;
    };

    const seek = (value: number) => {
        const audio = audioRef.current;
        if (!audio || !Number.isFinite(value)) {
            return;
        }
        audio.currentTime = value;
        setCurrent(value);
    };

    if (!src) {
        return (
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                Audio unavailable.
            </p>
        );
    }

    if (errored) {
        return (
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                Audio unavailable — refresh the page, or use the download
                button.
            </p>
        );
    }

    return (
        <div className="flex min-w-0 flex-1 items-center gap-3">
            {/* Headless element: all UI lives in the page below. */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
                ref={setRefs}
                src={src}
                preload="metadata"
                className="hidden"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onError={() => {
                    setErrored(true);
                    setPlaying(false);
                }}
                onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
                onTimeUpdate={(e) => {
                    if (!scrubbing) {
                        setCurrent(e.currentTarget.currentTime);
                    }
                }}
                onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    setDuration(Number.isFinite(d) ? d : null);
                }}
                onDurationChange={(e) => {
                    const d = e.currentTarget.duration;
                    setDuration(Number.isFinite(d) ? d : null);
                }}
            />
            <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-foreground"
                onClick={togglePlay}
                aria-label={playing ? "Pause" : "Play"}
            >
                {playing ? (
                    <Pause className="h-5 w-5" fill="currentColor" />
                ) : (
                    <Play className="h-5 w-5" fill="currentColor" />
                )}
            </Button>
            <span className="hidden shrink-0 text-sm tabular-nums text-muted-foreground min-[420px]:inline">
                {formatTime(current)} / {formatTime(duration)}
            </span>
            <input
                type="range"
                min={0}
                max={duration ?? 0}
                step={1}
                value={Math.min(current, duration ?? 0)}
                onChange={(e) => seek(Number(e.target.value))}
                onPointerDown={() => setScrubbing(true)}
                onPointerUp={() => setScrubbing(false)}
                onBlur={() => setScrubbing(false)}
                disabled={duration === null}
                aria-label="Seek"
                aria-valuetext={`${formatTime(current)} of ${formatTime(duration)}`}
                className="min-w-0 flex-1 cursor-pointer accent-primary disabled:cursor-default"
            />
            <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-foreground"
                onClick={toggleMute}
                aria-label={muted ? "Unmute" : "Mute"}
            >
                {muted ? (
                    // VolumeX — filled cone + X strokes
                    <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        aria-hidden="true"
                    >
                        <path
                            d="M11 5 6 9H2v6h4l5 4z"
                            fill="currentColor"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinejoin="round"
                        />
                        <line
                            x1="22"
                            y1="9"
                            x2="16"
                            y2="15"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                        />
                        <line
                            x1="16"
                            y1="9"
                            x2="22"
                            y2="15"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                        />
                    </svg>
                ) : (
                    // Volume2 — filled cone + stroked waves (NOT filled → no blob)
                    <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        aria-hidden="true"
                    >
                        <path
                            d="M11 5 6 9H2v6h4l5 4z"
                            fill="currentColor"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinejoin="round"
                        />
                        <path
                            d="M15.54 8.46a5 5 0 0 1 0 7.07"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                        />
                        <path
                            d="M19.07 4.93a10 10 0 0 1 0 14.14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                        />
                    </svg>
                )}
            </Button>
        </div>
    );
}
