"use client";

import React, { useState } from "react";
import type { MediaPlayerProps } from "@courselit/common-models";
import { MediaControls } from "./controls";
import { useMediaPlayback } from "./use-media-playback";
import { useMediaFullscreen } from "./use-media-fullscreen";

export function MediaPlayer(props: MediaPlayerProps) {
    const { src, title, labels, exclusive = true } = props;
    const { mediaRef, state, toggle, seek } = useMediaPlayback(src, exclusive);
    const presentation = useMediaFullscreen(
        mediaRef,
        props.kind === "video" && props.presentation === "responsive",
    );
    const [caption, setCaption] = useState("");
    const fullscreenAllowed =
        props.kind === "video" && props.presentation === "responsive";
    const compact = props.kind === "audio" && Boolean(props.compact);

    return (
        <div
            ref={presentation.wrapperRef}
            role="group"
            aria-label={title}
            className={`overflow-hidden rounded-xl border ${props.className || ""}`}
            style={
                presentation.fullscreen
                    ? {
                          background: "#111",
                          color: "white",
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                      }
                    : undefined
            }
        >
            {props.kind === "video" ? (
                <video
                    ref={(element) => {
                        mediaRef.current = element;
                    }}
                    src={src}
                    playsInline
                    preload="metadata"
                    poster={props.poster}
                    aria-label={title}
                    className="block w-full bg-black"
                    style={{
                        minHeight: 0,
                        maxHeight: presentation.fullscreen
                            ? "calc(100% - 160px)"
                            : "70vh",
                        objectFit: "contain",
                    }}
                >
                    {props.captions?.map((track) => (
                        <track
                            key={track.language}
                            kind="captions"
                            src={track.src}
                            srcLang={track.language}
                            label={track.label}
                        />
                    ))}
                </video>
            ) : (
                <audio
                    ref={(element) => {
                        mediaRef.current = element;
                    }}
                    src={src}
                    preload="metadata"
                    aria-label={title}
                />
            )}
            <MediaControls
                state={state}
                labels={labels}
                compact={compact}
                onToggle={() => {
                    void toggle();
                }}
                onSeek={seek}
                onMute={() => {
                    if (mediaRef.current) mediaRef.current.muted = !state.muted;
                }}
                onRate={(rate) => {
                    if (mediaRef.current) mediaRef.current.playbackRate = rate;
                }}
                fullscreen={
                    fullscreenAllowed
                        ? {
                              active: presentation.fullscreen,
                              toggle: () => {
                                  void (presentation.fullscreen
                                      ? presentation.exit()
                                      : presentation.enter(true));
                              },
                          }
                        : undefined
                }
            />
            {props.kind === "video" && Boolean(props.captions?.length) && (
                <label className="flex items-center gap-2 px-3 pb-3 text-sm">
                    {labels.captions}
                    <select
                        aria-label={labels.captions}
                        className="min-h-[44px] rounded border bg-transparent px-2"
                        value={caption}
                        onChange={(event) => {
                            setCaption(event.target.value);
                            const tracks = mediaRef.current?.textTracks;
                            if (tracks)
                                Array.from(tracks).forEach((track) => {
                                    track.mode =
                                        track.language === event.target.value
                                            ? "showing"
                                            : "disabled";
                                });
                        }}
                    >
                        <option value="">{labels.captionsOff}</option>
                        {props.captions?.map((track) => (
                            <option key={track.language} value={track.language}>
                                {track.label}
                            </option>
                        ))}
                    </select>
                </label>
            )}
            {props.transcriptUrl && (
                <a
                    className="inline-flex min-h-[44px] items-center px-3 underline"
                    href={props.transcriptUrl}
                >
                    {labels.transcript}
                </a>
            )}
            {state.failed && (
                <p role="alert" className="px-3 pb-3 text-sm">
                    {labels.playbackError}
                </p>
            )}
            {presentation.unavailable && fullscreenAllowed && (
                <p role="status" className="px-3 pb-3 text-sm">
                    {labels.fullscreenUnavailable}
                </p>
            )}
            {props.kind === "video" && props.presentation === "inline-only" && (
                <p className="px-3 pb-3 text-sm">{labels.inlineOnly}</p>
            )}
        </div>
    );
}
