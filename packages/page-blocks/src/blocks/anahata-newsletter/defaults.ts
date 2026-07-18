import type { SectionBackground, ThemeStyle } from "@courselit/page-models";
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

/**
 * Inert by default. The real site points this at `/our-newsletter`, but the
 * brief's link policy routes everything to "#" except Blog → /blog and
 * Shop → /products, and no `/our-newsletter` route exists in this app — a real
 * href here would 404. Matches the sibling anahata-header, whose "Our
 * Newsletter" nav item is likewise "#". Editable in the page builder.
 */
export const DEFAULT_SUBSCRIBE_LINK = "#";

export const DEFAULT_SUCCESS_MESSAGE =
    "Thank you. You are on the list for news from Anahata.";
export const DEFAULT_MISSING_EMAIL_MESSAGE = "Please enter your email address.";
export const DEFAULT_INVALID_EMAIL_MESSAGE =
    "Please enter a valid email address.";

export const DEFAULT_DISCLAIMER = "";

/* ------------------------------------------------------------------ *
 * Background — the "Stay in Touch" band sits on the site's own callout
 * photograph, anchored to its bottom edge so the horizon stays put as
 * the band grows. Editable through the standard Background panel.
 * Source: [25_all.css:481] #footer-callout-wrap.
 * ------------------------------------------------------------------ */

export const DEFAULT_BACKGROUND_IMAGE = "/anahata/footer-callout-bg.jpg";

export const DEFAULT_BACKGROUND: SectionBackground = {
    type: "image",
    media: { file: DEFAULT_BACKGROUND_IMAGE },
    backgroundSize: "cover",
    backgroundPosition: "center bottom",
    backgroundRepeat: "no-repeat",
};

/* ------------------------------------------------------------------ *
 * Palette.
 *
 * Every value below is a token from
 *   ~/amaanah/projects/karuna-membership/anahata-design-system/tokens.css
 * except the two feedback colours, which tokens.css does not define; those
 * come from the site's own stylesheet / the visual spec and are called out
 * individually.
 * ------------------------------------------------------------------ */

export const SAFFRON = "#ff9900"; // tokens --saffron — button fill only, never text (2.14:1 on white)
export const RUST = "#993300"; // tokens --rust (7.43:1 on white)
export const RUST_PRESSED = "#7a2900"; // --rust darkened ~12% for :active (visual spec §0.6, 9.79:1 on white with white text)
export const INK = "#545454"; // tokens --ink
export const CREAM = "#f7f4eb"; // tokens --cream
export const CARD = "#ffffff"; // tokens --card
export const COCOA = "#312110"; // tokens --cocoa — rest-state button text on saffron (7.24:1)
/**
 * tokens --border-warm. Raised from the original `#e7dfcc` (1.33:1 on white
 * — well under the 3:1 non-text/UI-component floor) to `#9c7f52` (3.77:1 on
 * white, 3.43:1 on cream) so the input/card boundary is actually perceivable,
 * still in the warm-tan family.
 */
export const BORDER_WARM = "#9c7f52";
export const INK_STRONG = "#373737"; // tokens .an-callout .an-quote colour
export const CALLOUT_INK = "#252525"; // visual spec §8 [25_all.css:483]

/** Not in tokens.css. From [25_all.css:175] (the theme's real invalid-field red). 4.57:1 on white. */
export const FEEDBACK_ERROR = "#dd3333";
/**
 * Not in tokens.css. The source value (#33dd33, [25_all.css:195]) fails contrast
 * on white; the visual spec prescribes this substitute (5.13:1 on white).
 */
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
