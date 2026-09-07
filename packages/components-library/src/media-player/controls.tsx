"use client";

import React from "react";
import {
    Pause,
    Play,
    RotateCcw,
    RotateCw,
    Volume2,
    VolumeX,
    Maximize,
    Minimize,
} from "lucide-react";
import type { MediaControlsProps } from "@courselit/common-models";

export function mediaTime(seconds: number) {
    const value = Number.isFinite(seconds)
        ? Math.max(0, Math.floor(seconds))
        : 0;
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    return `${hours ? `${hours}:` : ""}${hours ? String(minutes).padStart(2, "0") : minutes}:${String(value % 60).padStart(2, "0")}`;
}

export function MediaControls({
    state,
    labels,
    compact,
    onToggle,
    onSeek,
    onMute,
    onRate,
    fullscreen,
}: MediaControlsProps) {
    const button =
        "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
    return (
        <div className="flex flex-col gap-2 p-3">
            <input
                type="range"
                min={0}
                max={state.duration || 0}
                step={0.1}
                value={Math.min(state.currentTime, state.duration)}
                onChange={(event) => onSeek(Number(event.target.value))}
                disabled={!state.duration}
                aria-label={labels.seek}
                aria-valuetext={`${mediaTime(state.currentTime)} / ${mediaTime(state.duration)}`}
                className="w-full min-h-[44px] accent-current"
            />
            <div className="flex flex-wrap items-center gap-1">
                <button
                    type="button"
                    className={button}
                    onClick={onToggle}
                    aria-label={state.playing ? labels.pause : labels.play}
                >
                    {state.playing ? (
                        <Pause size={20} aria-hidden />
                    ) : (
                        <Play size={20} aria-hidden />
                    )}
                </button>
                {!compact && (
                    <>
                        <button
                            type="button"
                            className={button}
                            onClick={() => onSeek(state.currentTime - 15)}
                            aria-label={labels.back}
                        >
                            <RotateCcw size={20} aria-hidden />
                            <span className="text-xs">15</span>
                        </button>
                        <button
                            type="button"
                            className={button}
                            onClick={() => onSeek(state.currentTime + 15)}
                            aria-label={labels.forward}
                        >
                            <RotateCw size={20} aria-hidden />
                            <span className="text-xs">15</span>
                        </button>
                    </>
                )}
                <span className="text-xs tabular-nums" aria-hidden="true">
                    {mediaTime(state.currentTime)} / {mediaTime(state.duration)}
                </span>
                <div className="flex-1" />
                <button
                    type="button"
                    className={button}
                    onClick={onMute}
                    aria-label={state.muted ? labels.unmute : labels.mute}
                >
                    {state.muted ? (
                        <VolumeX size={20} aria-hidden />
                    ) : (
                        <Volume2 size={20} aria-hidden />
                    )}
                </button>
                {!compact && (
                    <label className="flex items-center gap-1 text-xs">
                        <span className="sr-only">{labels.speed}</span>
                        <select
                            className="min-h-[44px] rounded border bg-transparent px-2"
                            aria-label={labels.speed}
                            value={state.rate}
                            onChange={(event) =>
                                onRate(Number(event.target.value))
                            }
                        >
                            {[0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                                <option key={rate} value={rate}>
                                    {rate}×
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                {fullscreen && (
                    <button
                        type="button"
                        className={button}
                        onClick={fullscreen.toggle}
                        aria-label={
                            fullscreen.active
                                ? labels.exitFullscreen
                                : labels.fullscreen
                        }
                    >
                        {fullscreen.active ? (
                            <Minimize size={20} aria-hidden />
                        ) : (
                            <Maximize size={20} aria-hidden />
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}
