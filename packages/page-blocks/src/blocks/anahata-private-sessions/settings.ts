import { WidgetDefaultSettings } from "@courselit/common-models";
import {
    type ImageSource,
    resolveImageSrc,
} from "../../components/image-source";

/**
 * The picture source is the shared tagged union (`url` · `media` ·
 * `placeholder`) from `components/image-source`. This block used to carry its
 * own two-arm copy; the shared one was generalised from it, so re-exporting
 * keeps every existing import path and stored document working.
 */
export type { ImageSource };

/**
 * The block's original reader, kept as an alias of the shared one so callers
 * never branch on the tag. `undefined` for an absent source, an empty file,
 * OR a placeholder — the widget checks `isWaiting` for the latter.
 */
export const resolveImageSource = resolveImageSrc;

/** One list item in the callout. `id` is stable across drags/edits. */
export interface Bullet {
    id: string;
    text: string;
}

/**
 * Which side the photograph sits on at >= 768px. Below that the copy leads and
 * the photograph follows it (the Forest & Bone split on phones).
 */
export type PhotoPosition = "left" | "right";

export default interface Settings extends WidgetDefaultSettings {
    /** The 3:2 photograph (or its waiting-for-asset well) beside the copy. */
    photo?: ImageSource;
    /** Alt text for the portrait. Empty string marks it decorative. */
    photoAlt?: string;
    /**
     * Intrinsic pixel size of the portrait, used to reserve the box (CLS).
     * While the photo is a placeholder these define the well's aspect.
     */
    photoWidth?: number;
    photoHeight?: number;

    /** Ornament pinned to the bottom-right of the copy panel. */
    decorImage?: ImageSource;
    showDecorImage?: boolean;

    /** The Playfair H2 above the lead. */
    heading?: string;
    /** The lead line under the heading. */
    lead?: string;
    /** The verbatim bullet list. */
    bullets?: Bullet[];

    /** Call to action. */
    buttonCaption?: string;
    buttonAction?: string;
    buttonOpensInNewTab?: boolean;

    /** Palette overrides. Defaults are the swamikk v1.0 tokens (Forest & Bone). */
    panelColor?: string;
    /** Heading, lead line and the bullet markers — the display voice. */
    leadColor?: string;
    textColor?: string;
    buttonColor?: string;
    buttonHoverColor?: string;
    buttonTextColor?: string;
    /**
     * Text colour once the background has moved to `buttonHoverColor`
     * (hover AND active/pressed). Kept separate from `buttonTextColor` so a
     * palette whose rest and hover grounds need different text can still
     * pass AA on both — see defaults.ts for the measured ratios.
     */
    buttonHoverTextColor?: string;

    photoPosition?: PhotoPosition;
    cssId?: string;
}
