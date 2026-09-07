import type { MediaPlayerLabels } from "./media-player";

// Shared default copy: app config re-exports this so catalog widgets and lesson
// players use one vocabulary without depending on the app from a package.
export const mediaPlayerUi: MediaPlayerLabels = {
    audioTitle: "Audio practice",
    play: "Play",
    pause: "Pause",
    back: "Back 15 seconds",
    forward: "Forward 15 seconds",
    mute: "Mute",
    unmute: "Unmute",
    seek: "Playback position",
    speed: "Playback speed",
    fullscreen: "Fullscreen",
    exitFullscreen: "Exit fullscreen",
    fullscreenUnavailable:
        "Fullscreen needs a tap in this browser. Use Fullscreen to try again; playback continues inline.",
    inlineOnly:
        "Playback stays inline in Member Mimic so the member's identity remains visible.",
    playbackError:
        "Playback could not start. Check your connection and try Play again. If the link has expired, reload this page.",
    captions: "Captions",
    captionsOff: "Off",
    transcript: "Read transcript",
};

export const catalogMediaUi = {
    membership: "Membership",
    class: "Class",
    download: "Download",
    preview: "Audio preview",
    monthly: "/ month",
    yearly: "/ year",
    installments: "monthly installments",
    previewSetting: "Public audio preview",
    previewHelp:
        "Choose a separate public sample for the catalog. The full paid lesson stays private. Save publishes this sample on the product card.",
    savePreview: "Save preview",
    savingPreview: "Saving…",
    previewSaved: "Audio preview saved.",
};
