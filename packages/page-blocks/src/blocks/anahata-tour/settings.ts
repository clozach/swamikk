import { Media, WidgetDefaultSettings } from "@courselit/common-models";

/**
 * Aspect ratios offered for the tour frame. Written as "w:h" so the value is
 * readable in the page-builder and trivially parseable at render time.
 */
export type TourAspectRatio =
    | "21:9"
    | "16:9"
    | "3:2"
    | "4:3"
    | "1:1"
    | "3:4"
    | "9:16";

/**
 * How the third-party tour is brought onto the page.
 *
 * - "eager"  — the iframe is in the DOM on first paint (the demo just works).
 * - "click"  — a lightweight poster stands in until the visitor asks for it,
 *              so a heavy third-party bundle is never fetched on a casual
 *              visit. Discriminated union rather than a `lazy: boolean` so the
 *              poster-only fields can be reasoned about as one mode.
 */
export type TourLoadStrategy = "eager" | "click";

/** Where the explanatory copy sits relative to the tour frame. */
export type TourCaptionPlacement = "above" | "below";

export type TourHeadingAlignment = "left" | "center";

export default interface Settings extends WidgetDefaultSettings {
    /** Section heading. Anahata default: "Take a tour of Anahata". */
    heading?: string;
    headingAlignment?: TourHeadingAlignment;
    /** The 200px rust rule under the heading (real-site detail). */
    showDivider?: boolean;

    /** Explanatory copy. Anahata default is the "Click and drag…" sentence. */
    caption?: string;
    /** Real site renders the caption *after* the frame; default "below". */
    captionPlacement?: TourCaptionPlacement;

    /** The live tour URL. */
    tourUrl?: string;
    /** Accessible name for the iframe (also its `name` attribute). */
    tourTitle?: string;

    desktopAspectRatio?: TourAspectRatio;
    mobileAspectRatio?: TourAspectRatio;

    loadStrategy?: TourLoadStrategy;
    /** Optional still shown behind the click-to-load button. */
    posterImage?: Partial<Media>;
    posterButtonLabel?: string;
    posterHelpText?: string;

    cssId?: string;
}
