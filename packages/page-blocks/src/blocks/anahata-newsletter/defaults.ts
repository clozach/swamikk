import type { SectionBackground, ThemeStyle } from "@courselit/page-models";
import { PALETTE } from "../../components/palette";
import type { SubscribeMode } from "./settings";

/* ------------------------------------------------------------------ *
 * Copy — every string here is the block's DEFAULT, and every one of
 * them is editable from the page builder (see admin-widget.tsx).
 * ------------------------------------------------------------------ */

export const DEFAULT_HEADING = "Stay in Touch";

export const DEFAULT_BODY =
    "Subscribe to our newsletter to stay up to date on the latest special events and retreat happenings.";

export const DEFAULT_SUBSCRIBE_MODE: SubscribeMode = "form";

export const DEFAULT_EMAIL_LABEL = "Email address";
export const DEFAULT_EMAIL_PLACEHOLDER = "Your email address";
export const DEFAULT_BUTTON_CAPTION = "Subscribe";

/** The native homepage form has this stable anchor in its page settings. */
export const DEFAULT_SUBSCRIBE_LINK = "/#stay-in-touch";

export const DEFAULT_SUCCESS_MESSAGE =
    "Thank you. You are on the list for news from Anahata.";
export const DEFAULT_MISSING_EMAIL_MESSAGE = "Please enter your email address.";
export const DEFAULT_INVALID_EMAIL_MESSAGE =
    "Please enter a valid email address.";
/** Shown when the request reaches the server but the subscription fails. */
export const DEFAULT_SUBMISSION_ERROR_MESSAGE =
    "We couldn't add you just now. Please try again in a moment.";

export const DEFAULT_DISCLAIMER = "";

/* ------------------------------------------------------------------ *
 * Background — the "Stay in Touch" band is a solid fern ground (Forest &
 * Bone; homepage-redesign CONTRACT § anahataNewsletter): no photograph and
 * no overlay, so the band's contrast is a fixed property of the palette
 * rather than of whatever pixels a photo happens to put under the text.
 * Editable through the standard Background panel; the layout script writes
 * this same shape — `{ type: "color", backgroundColor: "#d6e0c3" }`.
 *
 * No `backgroundColorDark` on purpose: the heading, body and field colours
 * below are fixed palette values, not theme tokens, so `Section` falls back
 * to the light fern in dark mode and the text keeps its measured contrast.
 * ------------------------------------------------------------------ */

export const DEFAULT_BACKGROUND: SectionBackground = {
    type: "color",
    backgroundColor: PALETTE.fern,
};

/* ------------------------------------------------------------------ *
 * Palette — swamikk-design-system/tokens.css v1.0 (Forest & Bone), via
 * components/palette.ts. No invented colours. Ratios measured with the
 * WCAG relative-luminance formula against the ground each sits on. The only
 * hexes declared here are the two feedback colours, which are functional
 * (invalid / confirmed) rather than brand and so stay outside the roles.
 * ------------------------------------------------------------------ */

/** pine: the heading (7.0:1 on fern). */
export const HEADING_COLOR = PALETTE.pine;
/** ink: body copy and small print (10.5:1 on fern). */
export const BODY_COLOR = PALETTE.ink;

/** card: the email field and the feedback box. */
export const FIELD_GROUND = PALETTE.card;
/** ink: typed text in the field (13.6:1 on card). */
export const FIELD_TEXT = PALETTE.ink;
/** ink-soft at full opacity (7.5:1 on card) — was ink at 60%, which blends to 3.8:1. */
export const FIELD_PLACEHOLDER = PALETTE.inkSoft;
/** edge: field and feedback-box border (4.1:1 on card, 3.2:1 on fern — both clear the 3:1 UI floor). */
export const FIELD_EDGE = PALETTE.edge;
/** pine: every focus ring (7.0:1 on fern, 9.1:1 on card). */
export const FOCUS_RING = PALETTE.pine;

/** moss: the Subscribe button at rest — ink text (5.8:1) inside a 1.5px pine border. */
export const BUTTON_GROUND = PALETTE.moss;
export const BUTTON_TEXT = PALETTE.ink;
export const BUTTON_EDGE = PALETTE.pine;
/** pine-deep with bone text (10.7:1) — hover AND :active, which the widget pins separately. */
export const BUTTON_GROUND_PRESSED = PALETTE.pineDeep;
export const BUTTON_TEXT_PRESSED = PALETTE.bone;
/**
 * ink-soft with bone text (6.5:1) while a submission is in flight. A solid
 * fill, not `opacity-*`, so the disabled contrast is fixed rather than a
 * blend with the ground.
 */
export const BUTTON_GROUND_DISABLED = PALETTE.inkSoft;
export const BUTTON_TEXT_DISABLED = PALETTE.bone;

/**
 * Not in the palette. The theme's own invalid-field red ([25_all.css:175],
 * #dd3333) measures 4.3:1 on card — under the 4.5:1 text floor the feedback
 * box needs now that its ground is card rather than white — so it is
 * darkened one step: 5.3:1 on card, 4.1:1 on fern as the field's invalid
 * border.
 */
export const FEEDBACK_ERROR = "#c62828";
/** Not in the palette. 4.8:1 on card (the source value #33dd33 fails outright). */
export const FEEDBACK_SUCCESS = "#2e7d32";

/* ---- type ---- */

export const FONT_DISPLAY =
    'var(--font-playfair-display), "Playfair Display", Georgia, serif';
export const FONT_BODY =
    'var(--font-open-sans), "Open Sans", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

/* ---- structure ---- *
 * The band carries its own 40px/45px padding (visual spec §8), so the shared
 * Vertical padding control starts at zero and adds on top of it.
 */
export const DEFAULT_VERTICAL_PADDING: ThemeStyle["structure"]["section"]["padding"]["y"] =
    "py-0";
