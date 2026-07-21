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
export const INK = "#545454";
export const SAFFRON = "#ff9900";

/* Dark-mode band + surface colours, matching the values already verified for
   the CourseLit theme's own dark palette (courselit-test/apply-anahata-theme.sh)
   rather than inventing a second dark palette to keep in step. Contrast,
   computed against these exact hexes (WCAG relative luminance, not eyeballed):
     CREAM on DARK_BG    16.83:1   (rest text)
     SAFFRON on DARK_BG   8.64:1   (hover/focus — brand colour, legible here
                                    unlike on cream, so it gets promoted from
                                    "hover accent" to doing double duty as the
                                    rest-state accent too; see NAV_LINK below)
     AMBER on DARK_BG    11.19:1   (active/pressed)
     RUST on DARK_BG      2.49:1   ✗ — unusable as dark-mode text OR as the
                                    header's 6px top border (fails the 3:1
                                    non-text floor), so the top border swaps
                                    to SAFFRON in dark rather than staying RUST
     CREAM on DARK_PANEL 14.43:1   (flyout rest text)
     SAFFRON on DARK_PANEL 7.41:1  (flyout hover)
     AMBER on DARK_PANEL  9.60:1   (flyout active)
   DARK_PANEL is lighter than DARK_BG so a dropdown reads as a raised surface,
   the same role "popover" plays in the CourseLit dark theme; the two are close
   in luminance (1.17:1) by design — cocoa "depth" cards throughout this system
   lean on their border/shadow for separation rather than surface contrast,
   the same choice already made for the CourseLit theme's card/popover/muted
   trio. */
export const DARK_BG = "#1a120a";
export const DARK_PANEL = "#2c2013";
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
   all measured against the cream header band.

   Deliberately NO leading-[50px]: forcing the line box to exactly match the
   container height replaces flexbox centering with the font's own ascent/
   descent split, which is rarely 50/50 — Open Sans in particular sits visibly
   high inside a line box that tall. `flex items-center` alone centers the
   text's natural (short) line box on the container's true midline instead,
   matching how the icon-only theme toggle already centers beside it. */
export const NAV_LINK =
    "flex h-[50px] items-center whitespace-nowrap font-bold uppercase text-[var(--nav-fg)] no-underline transition-colors duration-100 ease-in hover:text-[var(--nav-fg-hover)] focus-visible:text-[var(--nav-fg-hover)] active:text-[var(--nav-fg-active)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-fg-hover)]";
/* The `max-[1099px]:px-[10px]` step (was `max-[829px]`) tightens the nav
   through the 961–1099 pinch zone, where the newly-added account control on
   the right leaves the 8-item nav just short of a single line at px-[13].
   Paired with hiding the account's first name below 1100 (ACCOUNT_TRIGGER_NAME),
   this keeps the masthead one row across the whole realistic desktop range;
   below 961 (tablet-ish) the nav still wraps, which is acceptable there. */
export const NAV_LINK_METRICS =
    "px-[25px] text-[16px] max-[1419px]:px-[20px] max-[1419px]:text-[15px] max-[1309px]:px-[13px] max-[1309px]:text-[14px] max-[1099px]:px-[10px]";

/* The flyout's top accent bar was saffron (2.14:1 on its white panel,
   under the 3:1 UI-boundary floor) — rust reaches 7.43:1 in light mode.
   Same --nav-panel-* / --nav-fg-* variables as NAV_LINK, inherited from the
   band, so the flyout automatically matches whichever mode set them. */
export const FLYOUT_PANEL =
    "absolute z-[10001] min-w-[140px] max-w-[280px] border-t-[5px] border-solid border-t-[var(--nav-panel-border)] bg-[var(--nav-panel-bg)] p-[10px] text-left shadow-[0_3px_10px_rgba(0,0,0,0.1)] transition-[opacity,transform] duration-200 ease-out";
export const FLYOUT_LINK =
    "block px-[10px] py-[6px] text-[14px] uppercase leading-[1.4] text-[var(--nav-fg)] no-underline transition-colors duration-100 ease-in hover:text-[var(--nav-fg-hover)] focus-visible:text-[var(--nav-fg-hover)] active:text-[var(--nav-fg-active)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-fg-hover)]";

/* Lives inside the DRAWER (#262626) panel only — saffron text there is
   7.07:1, so it stays as the hover/focus accent unchanged. */
export const MOBILE_LINK =
    "block py-[0.9em] pr-5 text-[14px] uppercase text-white no-underline transition-colors duration-100 ease-in hover:text-[#ff9900] focus-visible:text-[#ff9900] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#ff9900]";

/* The theme switch at the end of the nav. Inherits the same --nav-fg-*
   variables as NAV_LINK, so it stays in step with light/dark automatically —
   including its own icon, which would otherwise render an ink-on-ink glyph
   invisible against the dark band (ink measures 2.44:1 on DARK_BG). Square
   rather than text-padded, since it holds a 16px glyph. */
export const NAV_THEME_TOGGLE =
    "flex h-[50px] w-[44px] cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[var(--nav-fg)] transition-colors duration-100 ease-in hover:text-[var(--nav-fg-hover)] focus-visible:text-[var(--nav-fg-hover)] active:text-[var(--nav-fg-active)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-fg-hover)] max-[1309px]:w-[38px] max-[829px]:w-[34px]";

/* ------------------------------------------------------------------ *
 * Account control (top-right of the masthead).
 *
 * Every colour here rides the same --nav-* variables the band sets, so the
 * whole control tracks light/dark without nextTheme threaded through it —
 * rust accents on cream, saffron on the dark band, exactly like the nav.
 * ------------------------------------------------------------------ */

/* Signed-out sign-in affordance. An outlined pill (not a saffron fill):
   quieter than a primary CTA and harmonious with the header rather than
   shouting from the corner. Rust border/text on cream is 6.75:1; on the dark
   band the same variable resolves to saffron at 8.64:1 — both clear AA. The
   colour-mix hover tint is a faint wash of whichever accent is live. */
export const ACCOUNT_LOGIN_PILL =
    "inline-flex items-center gap-[8px] whitespace-nowrap rounded-[6px] border-[1.5px] border-solid border-[var(--nav-fg-hover)] bg-transparent px-[18px] py-[8px] text-[13.5px] font-bold uppercase leading-none text-[var(--nav-fg-hover)] no-underline transition-colors duration-100 ease-in hover:bg-[color-mix(in_srgb,var(--nav-fg-hover)_12%,transparent)] active:text-[var(--nav-fg-active)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-fg-hover)]";

/* Signed-in trigger: avatar + first name + chevron. Name colour is the nav's
   rest ink/cream; the whole thing gets a faint hover ground so it reads as a
   button, matching the flyout triggers. */
export const ACCOUNT_TRIGGER =
    "flex items-center gap-[9px] cursor-pointer rounded-[8px] border-0 bg-transparent py-[5px] pl-[5px] pr-[8px] text-[var(--nav-fg)] transition-colors duration-100 ease-in hover:bg-[color-mix(in_srgb,var(--nav-fg)_8%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-fg-hover)]";
/* The first name drops out below 1100px (avatar + chevron only), which both
   frees room for the nav through the pinch zone and is a conventional compact
   header form; the full name still shows in the dropdown. */
export const ACCOUNT_TRIGGER_NAME =
    "whitespace-nowrap text-[14px] font-bold text-[var(--nav-fg)] max-[1099px]:hidden";

/* The avatar chip. Rust ground with cream initials reads on both bands
   (cream on rust is 6.7:1) and is replaced by the member's photo when set. */
export const ACCOUNT_AVATAR =
    "flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#993300] text-[13px] font-bold uppercase leading-none text-[#f7f4eb]";

/* Dropdown panel. Same white/dark-panel ground and rust/saffron top accent as
   the nav flyout (FLYOUT_PANEL), right-anchored so it can never leave the
   viewport — the trigger already sits against the band's right padding, so the
   panel only ever grows leftward and downward. */
export const ACCOUNT_MENU =
    "absolute right-0 top-[calc(100%+8px)] z-[10001] w-[250px] border-t-[5px] border-solid border-t-[var(--nav-panel-border)] bg-[var(--nav-panel-bg)] p-[8px] text-left shadow-[0_8px_26px_rgba(0,0,0,0.16)]";
/* Menu rows are sentence-case actions (not uppercase nav labels), matching the
   dashboard's own account menu so a member meets the same vocabulary in both
   places. Rust/saffron icon + hover, inherited from --nav-fg-hover. */
export const ACCOUNT_MENU_ITEM =
    "flex items-center gap-[11px] rounded-[6px] px-[10px] py-[9px] text-[13.5px] font-semibold text-[var(--nav-fg)] no-underline transition-colors duration-100 ease-in hover:bg-[color-mix(in_srgb,var(--nav-fg-hover)_10%,transparent)] hover:text-[var(--nav-fg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--nav-fg-hover)]";
export const ACCOUNT_MENU_SEP =
    "my-[4px] mx-[4px] h-px bg-[color-mix(in_srgb,var(--nav-fg)_14%,transparent)]";

/* Mobile account block, inside the DRAWER (#262626). Saffron is legible here
   (7.07:1), so the drawer keeps the brand accent — matching MOBILE_LINK. The
   signed-out CTA is a saffron fill with cocoa text (7.24:1), the one place the
   account control leans loud, because on a phone it is the primary next step. */
export const ACCOUNT_MOBILE_CTA =
    "flex items-center justify-center gap-[8px] rounded-[7px] bg-[#ff9900] px-[16px] py-[12px] text-[13px] font-bold uppercase leading-none tracking-[0.02em] text-[#312110] no-underline transition-colors duration-100 ease-in hover:bg-[#ffbf00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffbf00]";
export const ACCOUNT_MOBILE_LINK =
    "flex items-center gap-[12px] py-[11px] pr-5 text-[14px] uppercase text-white no-underline transition-colors duration-100 ease-in hover:text-[#ff9900] focus-visible:text-[#ff9900] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#ff9900]";
