import { FONT_BODY, FONT_DISPLAY, PALETTE } from "../../components/palette";
import type { ImageSource, PhotoPosition } from "./settings";

/* ------------------------------------------------------------------
   Copy — homepage-redesign-spec.md § 3, verbatim. These are the
   DEFAULTS the page builder seeds a fresh block with; every one of
   them is editable in the admin panel.
   ------------------------------------------------------------------ */

/**
 * The photograph has not arrived yet: the block ships a placeholder whose
 * description (spec § 3) renders as a waiting-for-asset well in the exact
 * 3:2 box the final image will occupy.
 */
export const photo: ImageSource = {
    kind: "placeholder",
    description:
        "Swami Karma Karuna with one student, seated facing each other in conversation. Soft light. Relaxed, attentive.",
};
/** Decorative by default; the well carries its own description as its name. */
export const photoAlt = "";
/**
 * The 3:2 box the well (and later the photograph) occupies. Update these to
 * the real asset's natural size when it lands so the crop follows it.
 */
export const photoWidth = 1536;
export const photoHeight = 1024;

/** Legacy ornament, hidden by default in the Forest & Bone layout. */
export const decorImage: ImageSource = {
    kind: "url",
    url: "/anahata/testimonial-bg.jpg",
};
export const showDecorImage = false;

export const heading = "Work with Swami one to one";

export const lead =
    "Private yoga training, consultations and yogic cleansing practices with Swami Karma Karuna are offered online and in-person by appointment.";

/** The mentoring bullet (Al's brief) first, then the six verbatim from the site. */
export const bulletTexts: string[] = [
    "Mentoring and coaching for yoga teachers, space-holders, and anyone bringing the practices into daily life.",
    "Find out which yoga, breathing and meditation practices suit your personality, health challenges and energy flow.",
    "Build your at-home yoga practice with a personalised yoga programme to support yourself emotionally, physically and spiritually.",
    "Ask questions about your spiritual path.",
    "Develop a better understanding of your body.",
    "Practices are given according to individual needs to treat imbalances or enhance desired mental, emotional, physical and energetic states for optimal well-being.",
    "Perfect for both beginners to yoga or those wanting to deepen and refine their practice.",
];

export const buttonCaption = "Private Sessions";
export const buttonAction = "/p/private-sessions";
export const buttonOpensInNewTab = false;

/* ------------------------------------------------------------------
   Palette — swamikk-design-system/tokens.css v1.0 (Forest & Bone), via
   components/palette.ts. No invented colours. Ratios measured with the
   WCAG relative-luminance formula.
   ------------------------------------------------------------------ */

/** bone: the panel is the page ground — no callout panel any more. */
export const panelColor = PALETTE.bone;
/** pine: heading, lead line and bullet markers (7.76:1 on bone). */
export const leadColor = PALETTE.pine;
/** ink: bullet copy (11.63:1 on bone). */
export const textColor = PALETTE.ink;
/** pine: button rest ground. */
export const buttonColor = PALETTE.pine;
/** pine-deep: the hover / pressed ground. */
export const buttonHoverColor = PALETTE.pineDeep;
/** bone on pine: 7.76:1. */
export const buttonTextColor = PALETTE.bone;
/** bone on pine-deep: 10.67:1 (hover AND :active, which the widget pins together). */
export const buttonHoverTextColor = PALETTE.bone;
/** pine: the focus ring, as the design system's global `:focus-visible`. */
export const focusColor = PALETTE.pine;

/** Playfair Display, through the app's next/font variable when present. */
export const fontDisplay = `var(--font-playfair-display), ${FONT_DISPLAY}`;
/** Open Sans, through the app's next/font variable when present. */
export const fontBody = `var(--font-open-sans), ${FONT_BODY}`;

export const photoPosition: PhotoPosition = "left";

/** The design's breath-paced rest: 96px between sections. */
export const verticalPadding = "py-24" as const;
/** 1152px — the design's container width. */
export const maxWidth = "max-w-6xl" as const;
