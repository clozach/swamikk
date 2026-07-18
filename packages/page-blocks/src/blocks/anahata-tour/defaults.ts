import type {
    TourAspectRatio,
    TourCaptionPlacement,
    TourHeadingAlignment,
    TourLoadStrategy,
} from "./settings";

/* ------------------------------------------------------------------ *
 * Anahata palette — mirrors anahata-design-system/tokens.css.
 * The CourseLit theme tokens (bg-background / text-foreground …) carry
 * the *site's* palette, not Anahata's, so the brand hexes are declared
 * here once and applied through scoped CSS in widget.tsx.
 * ------------------------------------------------------------------ */
export const CREAM = "#f7f4eb"; // --cream : page ground
export const INK = "#545454"; // --ink   : body copy
export const RUST = "#993300"; // --rust  : h2, divider, hover
export const SAFFRON = "#ff9900"; // --saffron : buttons, accents
export const CARD = "#ffffff"; // --card
export const RUST_PRESSED = "#7a2900"; // rust darkened ~12% for :active

export const FONT_DISPLAY = `var(--font-playfair-display), "Playfair Display", Georgia, serif`;
export const FONT_BODY = `var(--font-open-sans), "Open Sans", -apple-system, "Segoe UI", sans-serif`;

/** The single mobile breakpoint the real site uses. */
export const MOBILE_BREAKPOINT_PX = 767;

/** 0.1s ease-in — the site's own button transition. */
export const HOVER_DURATION_MS = 100;

/* ------------------------------------------------------------------ *
 * Content defaults — verbatim Anahata copy.
 * ------------------------------------------------------------------ */
export const heading = "Take a tour of Anahata";
export const headingAlignment: TourHeadingAlignment = "center";
export const showDivider = true;

export const caption =
    "Click and drag around the map to explore the land of Anahata, visit our different buildings and accommodation and see snippets of life in our community.";
export const captionPlacement: TourCaptionPlacement = "below";

export const tourUrl = "https://tour.anahata-retreat.org.nz/index.htm";
export const tourTitle = "Tour of Anahata";

export const desktopAspectRatio: TourAspectRatio = "16:9";
/** 16:9 is only ~211px tall on a 375px phone — 4:3 keeps the tour usable. */
export const mobileAspectRatio: TourAspectRatio = "4:3";

/** Eager by default so the demo works with zero configuration. */
export const loadStrategy: TourLoadStrategy = "eager";
export const posterButtonLabel = "Load The 3D Tour";
export const posterHelpText =
    "The interactive tour is hosted by Anahata Yoga Retreat and loads on request.";

/** The permission set the real site's iframe carries. */
export const IFRAME_ALLOW =
    "fullscreen; accelerometer; gyroscope; magnetometer; vr; xr; xr-spatial-tracking";

export const ASPECT_RATIO_OPTIONS: { label: string; value: TourAspectRatio }[] =
    [
        { label: "21:9 — cinematic", value: "21:9" },
        { label: "16:9 — widescreen", value: "16:9" },
        { label: "3:2", value: "3:2" },
        { label: "4:3 — taller", value: "4:3" },
        { label: "1:1 — square", value: "1:1" },
        { label: "3:4 — portrait", value: "3:4" },
        { label: "9:16 — tall portrait", value: "9:16" },
    ];

/**
 * "w:h" → the padding-top percentage that reserves that ratio in a
 * position:relative box. Falls back to 16:9 on anything unparseable.
 */
export function aspectRatioToPaddingTop(ratio: string | undefined): number {
    const [w, h] = (ratio || desktopAspectRatio).split(":").map(Number);
    if (!w || !h || !Number.isFinite(w) || !Number.isFinite(h)) {
        return 56.25;
    }
    return (h / w) * 100;
}
