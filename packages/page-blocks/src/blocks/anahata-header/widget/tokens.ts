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
