/* ------------------------------------------------------------------ *
 * Palette + type — the Anahata design system tokens, AA-checked.
 * Used as raw hex in inline styles (grounds, borders) and as literal
 * Tailwind arbitrary values inside the class strings below, so the
 * package's own Tailwind pass emits them into dist/index.css.
 *   cream #f7f4eb · cocoa #312110 · ink #545454 · saffron #ff9900
 *   rust #993300 · rust-pressed #7a2900 · amber #ffbf00 · drawer #262626
 *
 * Saffron text on cream/white measures 1.95:1 / 2.14:1 — it fails AA
 * even at large-text size (needs 3:1), so it is never used as a text
 * colour against the cream header band; rust (6.75:1 on cream) carries
 * hover/focus/active there instead. Inside the DRAWER mobile panel
 * (#262626) saffron text reaches 7.07:1, easily passing, so it stays
 * as the hover/focus accent there — the brand's "energy" colour still
 * shows up, just on a ground dark enough to carry it.
 * ------------------------------------------------------------------ */
export const CREAM = "#f7f4eb";
export const COCOA = "#312110";
export const RUST = "#993300";
export const RUST_PRESSED = "#7a2900";
export const AMBER = "#ffbf00";
export const DRAWER = "#262626";
export const FONT_BODY =
    'var(--font-open-sans), "Open Sans", -apple-system, "Segoe UI", sans-serif';

/* Container: 1212px fixed, 95% below that; the header band goes
   full-bleed from 961px up, as #site-header-inner does on the live site. */
export const TOP_BAR_CONTAINER = "mx-auto w-[1212px] max-w-[95%]";
export const HEADER_CONTAINER =
    "mx-auto w-[1212px] max-w-[95%] min-[961px]:w-full min-[961px]:max-w-none min-[961px]:px-6";

/* Sticky header band. On the live site #site-header-sticky-wrapper wraps
   ONLY #site-header (logo + nav + mobile bar) — #top-bar-wrap sits outside
   it and simply scrolls away, so only the band below the cocoa strip pins.
   z-20 matches this codebase's other sticky header (packages/page-blocks
   header block) — comfortably above ordinary in-flow page content, and
   nowhere near the mobile drawer's z-[9999]/z-[10000] or the nav flyout's
   z-[10001]. Deliberately applied to this inner band, not the outer
   <header>: position: sticky/fixed always opens a new stacking context, and
   the drawer/flyout are read as *descendants* of <header> — keeping the
   drawer OUTSIDE this band (see widget/index.tsx) means its own very high
   z-index still compares directly against the rest of the page instead of
   being capped at this band's z-20. The flyout stays nested inside the band
   (it has to, for its hover anchor), so it's still capped at z-20 relative
   to later page content — comfortably enough to clear ordinary sections,
   which is the same trade the live site's own stacking makes.

   Plain `position: sticky` on the band does NOT work here: a sticky
   element's stuck range is bounded by its own containing block (its
   nearest block-level ancestor — here <header>), and <header>'s only
   content is TopBar + a 1px sentinel + the band itself, so <header> is
   barely taller than the band. Verified empirically (matching repro):
   the band reaches `top: 0` for a single scroll pixel (right as the
   sentinel leaves the viewport) and then immediately un-sticks and
   scrolls away with the rest of the page — fully gone within one band's
   height of further scrolling. `sticky` never gives a real "pinned"
   window because there's no taller containing block to hold it (the
   widget only owns its own two rows, not the rest of the page below).
   The fix mirrors what the live site's own JS does (toggle #site-header
   to `position: fixed` on scroll): once `useStuck`'s IntersectionObserver
   reports the sentinel has scrolled out — the same instant CSS sticky
   would have started failing — widget/index.tsx swaps the band to
   `position: fixed` and renders a same-height spacer in its old flow slot
   so the page never jumps. STICKY_HEADER_BAND_BASE is the at-rest (in
   normal flow) state; STICKY_HEADER_BAND_FIXED is the pinned state. */
export const STICKY_HEADER_BAND_BASE =
    "relative z-20 transition-shadow duration-200 ease-out motion-reduce:transition-none";
export const STICKY_HEADER_BAND_FIXED =
    "fixed inset-x-0 top-0 z-20 transition-shadow duration-200 ease-out motion-reduce:transition-none";
/* live site: #site-header-sticky-wrapper.is-sticky .has-sticky-dropshadow */
export const STICKY_HEADER_BAND_STUCK = "shadow-[0_2px_5px_rgba(0,0,0,0.1)]";

/* White text at 80% opacity over cocoa blends to ~#d6d3cf, 10.4:1 — the
   opacity fade reads as a hover without ever dropping under AA. Focus
   ring is saffron, which reaches 7.24:1 against the cocoa strip. */
export const TOP_BAR_LINK =
    "text-[14px] leading-[1.65] text-white no-underline transition-opacity duration-100 ease-in hover:opacity-80 focus-visible:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff9900]";

/* Rest ink 6.89:1, hover/focus rust 6.75:1, active rust-pressed 8.90:1 —
   all measured against the cream header band. */
export const NAV_LINK =
    "flex h-[50px] items-center whitespace-nowrap font-bold uppercase leading-[50px] text-[#545454] no-underline transition-colors duration-100 ease-in hover:text-[#993300] focus-visible:text-[#993300] active:text-[#7a2900] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]";
export const NAV_LINK_METRICS =
    "px-[25px] text-[16px] max-[1419px]:px-[20px] max-[1419px]:text-[15px] max-[1309px]:px-[13px] max-[1309px]:text-[14px] max-[829px]:px-[10px]";

/* The flyout's top accent bar was saffron (2.14:1 on its white panel,
   under the 3:1 UI-boundary floor) — rust reaches 7.43:1. */
export const FLYOUT_PANEL =
    "absolute z-[10001] min-w-[140px] max-w-[280px] border-t-[5px] border-solid border-t-[#993300] bg-white p-[10px] text-left shadow-[0_3px_10px_rgba(0,0,0,0.1)] transition-[opacity,transform] duration-200 ease-out";
export const FLYOUT_LINK =
    "block px-[10px] py-[6px] text-[14px] uppercase leading-[1.4] text-[#545454] no-underline transition-colors duration-100 ease-in hover:text-[#993300] focus-visible:text-[#993300] active:text-[#7a2900] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]";

/* Lives inside the DRAWER (#262626) panel only — saffron text there is
   7.07:1, so it stays as the hover/focus accent unchanged. */
export const MOBILE_LINK =
    "block py-[0.9em] pr-5 text-[14px] uppercase text-white no-underline transition-colors duration-100 ease-in hover:text-[#ff9900] focus-visible:text-[#ff9900] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#ff9900]";

/* The theme switch at the end of the nav. Inherits NAV_LINK's exact rest /
   hover / focus / active colours (ink 6.89:1, rust 6.75:1, rust-pressed
   8.90:1 on the cream band) so it stays AA without a second palette to keep
   in step. Square rather than text-padded, since it holds a 16px glyph. */
export const NAV_THEME_TOGGLE =
    "flex h-[50px] w-[44px] cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[#545454] transition-colors duration-100 ease-in hover:text-[#993300] focus-visible:text-[#993300] active:text-[#7a2900] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300] max-[1309px]:w-[38px] max-[829px]:w-[34px]";
