import type { ImageSource, PhotoPosition } from "./settings";

/* ------------------------------------------------------------------
   Anahata content, verbatim. These are the DEFAULTS the page builder
   seeds a fresh block with; every one of them is editable in the
   admin panel.
   ------------------------------------------------------------------ */

export const photo: ImageSource = {
    kind: "url",
    url: "/anahata/swami-kk-bio.jpg",
};
export const photoAlt = "Swami Karma Karuna";
/** Natural size of swami-kk-bio.jpg — 2048 x 1365 (3:2). */
export const photoWidth = 2048;
export const photoHeight = 1365;

export const decorImage: ImageSource = {
    kind: "url",
    url: "/anahata/testimonial-bg.jpg",
};
export const showDecorImage = true;

export const lead =
    "Private yoga training, consultations and yogic cleansing practices with Swami Karma Karuna are offered online and in-person by appointment.";

export const bulletTexts: string[] = [
    "Find out which yoga, breathing and meditation practices suit your personality, health challenges and energy flow.",
    "Build your at-home yoga practice with a personalised yoga programme to support yourself emotionally, physically and spiritually.",
    "Ask questions about your spiritual path.",
    "Develop a better understanding of your body.",
    "Practices are given according to individual needs to treat imbalances or enhance desired mental, emotional, physical and energetic states for optimal well-being.",
    "Perfect for both beginners to yoga or those wanting to deepen and refine their practice.",
];

export const buttonCaption = "Private Sessions";
export const buttonAction = "#";
export const buttonOpensInNewTab = false;

/* ------------------------------------------------------------------
   Palette — anahata-design-system/tokens.css. No invented colours.
   ------------------------------------------------------------------ */

/** --marigold: the testimonial / callout ground. */
export const panelColor = "#f6d36a";
/** --rust: authority; the h4 lead line (5.11:1 on marigold). */
export const leadColor = "#993300";
/** --ink: body copy (5.21:1 on marigold). */
export const textColor = "#545454";
/** --saffron: button ground. */
export const buttonColor = "#ff9900";
/** --rust again: the 100ms hover ground. */
export const buttonHoverColor = "#993300";
/**
 * White-on-saffron was the original pairing (2.14:1 — fails AA). Cocoa on
 * saffron measures 7.24:1, so that is now the rest-state button text.
 */
export const buttonTextColor = "#312110";
/**
 * Once the background moves to `buttonHoverColor` (rust) — on hover AND on
 * :active, which the widget pins to the same ground — white text reaches
 * 7.43:1 (9.79:1 once the pressed-state brightness dip is applied).
 */
export const buttonHoverTextColor = "#ffffff";

/** --font-body: Open Sans. (The source CSS names Lato/PT Sans but never loads them.) */
export const fontBody =
    'var(--font-open-sans), "Open Sans", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

export const photoPosition: PhotoPosition = "left";

/** Closest step on CourseLit's padding scale to the source row's 20px. */
export const verticalPadding = "py-6" as const;
/** Closest step to the source container's 1212px. */
export const maxWidth = "max-w-6xl" as const;
