"use client";

import { MediaPlayer } from "@courselit/components-library";
import { mediaPlayerUi } from "@/config/strings";

/** The existing course introduction now shares lesson and catalog controls. */
export default function LeanAudioPlayer({ src }: { src?: string }) {
    if (!src) return null;
    return (
        <MediaPlayer
            kind="audio"
            src={src}
            title={mediaPlayerUi.audioTitle}
            labels={mediaPlayerUi}
        />
    );
}
