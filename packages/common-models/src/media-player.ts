export interface MediaPlayerLabels {
    audioTitle: string;
    play: string;
    pause: string;
    back: string;
    forward: string;
    mute: string;
    unmute: string;
    seek: string;
    speed: string;
    fullscreen: string;
    exitFullscreen: string;
    fullscreenUnavailable: string;
    inlineOnly: string;
    playbackError: string;
    captions: string;
    captionsOff: string;
    transcript: string;
}

export interface MediaCaptionTrack {
    src: string;
    language: string;
    label: string;
}

export interface MediaPlayerOptions {
    src: string;
    title: string;
    labels: MediaPlayerLabels;
    exclusive?: boolean;
    className?: string;
    transcriptUrl?: string;
}

export type MediaPlayerProps = MediaPlayerOptions &
    (
        | { kind: "audio"; compact?: boolean }
        | {
              kind: "video";
              poster?: string;
              captions?: MediaCaptionTrack[];
              /** Mimic stays inline so its surrounding identity remains visible. */
              presentation: "responsive" | "inline-only";
          }
    );

export interface NativeFullscreenVideo extends HTMLVideoElement {
    webkitEnterFullscreen?: () => void;
    webkitExitFullscreen?: () => void;
    webkitDisplayingFullscreen?: boolean;
}

export interface MediaPlaybackState {
    playing: boolean;
    currentTime: number;
    duration: number;
    muted: boolean;
    rate: number;
    failed: boolean;
}

export interface MediaControlsProps {
    state: MediaPlaybackState;
    labels: MediaPlayerLabels;
    compact: boolean;
    onToggle: () => void;
    onSeek: (time: number) => void;
    onMute: () => void;
    onRate: (rate: number) => void;
    fullscreen?: { active: boolean; toggle: () => void };
}
