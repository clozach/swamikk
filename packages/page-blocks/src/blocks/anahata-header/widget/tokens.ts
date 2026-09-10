import { PALETTE } from "../../../components/palette";

/* ------------------------------------------------------------------ *
 * Palette + type — swamikk design-system v1.0 (Forest & Bone), AA-checked.
 *
 * Every colour the header paints comes from `components/palette.ts` and
 * reaches the DOM through CSS custom properties (`--nav-*`) set once on the
 * band (light or dark, by `nextTheme`) and once on each always-dark surface
 * (the mobile drawer, the utility strip). Class strings below only ever
 * reference `var(--nav-*)`, so no hex needs to appear literally in a class
 * for Tailwind to emit it, and a colour changes in exactly one place.
 *
 *   bone #e4e9d8 · ink #262b27 · pine #1f4d3b · pine-deep #153627
 *   moss #9aab74 · moss-light #c2cfa6 · edge #6f7d6b · card #f8f9f5
 *   pine-dark #12291f · footer-edge #6b8776
 *
 * Contrast, computed with the WCAG relative-luminance formula against the
 * exact hexes (scratchpad, 2026-09-10):
 *   LIGHT band (bone)        ink 11.63:1 rest · pine 7.76:1 hover/focus ·
 *                            pine-deep 10.67:1 active · edge 3.51:1 hairline
 *   LIGHT panel (card)       ink 13.63:1 · pine 9.10:1 · edge 4.12:1
 *   accent fill (pine)       bone text 7.76:1; pressed pine-deep 10.67:1
 *   DARK band (#0f1a15)      bone 14.37:1 rest · moss-light 10.83:1 hover ·
 *                            moss 7.17:1 active · footer-edge 4.54:1 hairline
 *   DARK panel (#1b2d24)     bone 11.71:1 · moss-light 8.82:1 · moss 5.84:1
 *   dark accent (moss-light) ink text 8.76:1; pressed moss, ink 5.80:1
 *   DRAWER (pine-dark)       bone 12.44:1 · moss-light 9.37:1 · moss 6.20:1 ·
 *                            footer-edge 3.93:1 hairline
 * ------------------------------------------------------------------ */
export const BAND_LIGHT = PALETTE.bone;
export const PANEL_LIGHT = PALETTE.card;

/* Dark-mode band + surface colours, hand-mirrored from the theme's own dark
   palette (courselit-test/homepage-redesign/CONTRACT.md § Theme: `dark.
   background` and `dark.popover`) rather than inventing a second dark set to
   keep in step. Change one without the other and the band stops matching the
   theme's popovers. DARK_PANEL is lighter than DARK_BG (1.23:1) so a dropdown
   reads as a raised surface — the same role "popover" plays in the theme;
   panels lean on their edge border for separation, as the theme's card/
   popover/muted trio does. */
export const BAND_DARK = "#0f1a15";
export const PANEL_DARK = "#1b2d24";

/* The always-dark surfaces (mobile drawer, utility strip) sit on the palette's
   "dark close" — the same pine-dark the footer stands on. */
export const DRAWER = PALETTE.pineDark;

export const FONT_BODY =
    'var(--font-open-sans), "Open Sans", -apple-system, "Segoe UI", sans-serif';
export const FONT_DISPLAY =
    'var(--font-playfair-display), "Playfair Display", Georgia, serif';

/**
 * The `--nav-*` set for the header band. Set on the band and inherited by
 * every descendant — nav links, flyouts, the account control, the login
 * popover, the theme toggle — so none of them need `nextTheme` threaded
 * through their own props.
 *
 *   --nav-fg          rest text (ink / bone)
 *   --nav-fg-hover    hover + focus text, accent fill, brand name, focus ring
 *   --nav-fg-active   pressed text, accent fill hover
 *   --nav-accent-fg   text on an accent fill (bone on pine / ink on moss-light)
 *   --nav-edge        hairlines: band bottom edge, inputs, drawer rules
 *   --nav-panel-bg    flyout / menu / popover ground
 *   --nav-panel-border  1px panel edge
 */
export function bandVars(dark: boolean): Record<string, string> {
    return dark
        ? {
              "--nav-fg": PALETTE.bone,
              "--nav-fg-hover": PALETTE.mossLight,
              "--nav-fg-active": PALETTE.moss,
              "--nav-accent-fg": PALETTE.ink,
              "--nav-edge": PALETTE.footerEdge,
              "--nav-panel-bg": PANEL_DARK,
              "--nav-panel-border": PALETTE.footerEdge,
          }
        : {
              "--nav-fg": PALETTE.ink,
              "--nav-fg-hover": PALETTE.pine,
              "--nav-fg-active": PALETTE.pineDeep,
              "--nav-accent-fg": PALETTE.bone,
              "--nav-edge": PALETTE.edge,
              "--nav-panel-bg": PANEL_LIGHT,
              "--nav-panel-border": PALETTE.edge,
          };
}

/** The same var set for a surface that is dark in both themes (drawer, strip). */
export const DARK_SURFACE_VARS: Record<string, string> = {
    "--nav-fg": PALETTE.bone,
    "--nav-fg-hover": PALETTE.mossLight,
    "--nav-fg-active": PALETTE.moss,
    "--nav-accent-fg": PALETTE.ink,
    "--nav-edge": PALETTE.footerEdge,
    "--nav-panel-bg": PALETTE.pineDark,
    "--nav-panel-border": PALETTE.footerEdge,
};

/* Container: 1212px fixed, 95% below that; the header band goes
   full-bleed from 961px up, as #site-header-inner does on the live site. */
export const TOP_BAR_CONTAINER = "mx-auto w-[1212px] max-w-[95%]";
export const HEADER_CONTAINER =
    "mx-auto w-[1212px] max-w-[95%] min-[961px]:w-full min-[961px]:max-w-none min-[961px]:px-6";

/* Sticky header band. On the live site #site-header-sticky-wrapper wraps
   ONLY #site-header (logo + nav + mobile bar) — #top-bar-wrap sits outside
   it and simply scrolls away, so only the band below the utility strip pins.
   z-20 matches this codebase's other sticky header (packages/page-blocks
   header block) — comfortably above ordinary in-flow page content, and
   below the mobile drawer's z-40/z-[41] and standard dialog z-50.
   Local account/flyout panels use z-[42]. Deliberately applied to this inner band, not the outer
   <header>: position: sticky/fixed always opens a new stacking context, and
   the drawer/flyout are read as *descendants* of <header> — keeping the
   drawer OUTSIDE this band (see widget/index.tsx) means its own
   z-index compares directly against the rest of the page instead of
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
/* Pins BELOW the Journey Card dev band when it is open: the band publishes its
   height as --jc-band-height (apps/web/components/dev/journey-card), and this
   `top` tracks it. Band closed ⇒ the var is unset ⇒ 0px ⇒ byte-identical to the
   old `top-0`. Default-preserving; the only header-machinery touch the Journey
   Card makes. */
export const STICKY_HEADER_BAND_FIXED =
    "fixed inset-x-0 top-[var(--jc-band-height,0px)] z-20 transition-shadow duration-200 ease-out motion-reduce:transition-none";
/* live site: #site-header-sticky-wrapper.is-sticky .has-sticky-dropshadow */
export const STICKY_HEADER_BAND_STUCK = "shadow-[0_2px_5px_rgba(0,0,0,0.1)]";

/* Utility strip links, on the pine-dark strip (DARK_SURFACE_VARS): bone at
   rest, moss-light on hover/focus (9.37:1), moss-light focus ring. */
export const TOP_BAR_LINK =
    "text-[14px] leading-[1.65] text-[var(--nav-fg)] no-underline transition-colors duration-100 ease-in hover:text-[var(--nav-fg-hover)] focus-visible:text-[var(--nav-fg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-fg-hover)]";

/* The brand link: 40×40 chip + the name in Playfair, pine at rest (7.76:1 on
   bone), pine-deep on hover/active; moss-light / moss on the dark band. The
   underline rides on the name only (BRAND_NAME), never the chip. */
export const BRAND_LINK =
    "group flex shrink-0 items-center gap-[12px] rounded-[6px] text-[var(--nav-fg-hover)] no-underline transition-colors duration-100 ease-in hover:text-[var(--nav-fg-active)] focus-visible:text-[var(--nav-fg-active)] active:text-[var(--nav-fg-active)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-fg-hover)]";
/* Visually hidden ≤479px (the chip alone carries the brand on a phone), but
   always in the accessible name. */
export const BRAND_NAME =
    "whitespace-nowrap text-[17px] font-bold leading-[1.2] underline-offset-4 decoration-1 group-hover:underline group-focus-visible:underline max-[479px]:sr-only";

/* Rest ink 11.63:1, hover/focus pine 7.76:1, active pine-deep 10.67:1 —
   all measured against the bone header band.

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

/* Flyout: card ground with a 1px edge border and a 6px radius (the reference
   submenu), replacing the old 5px accent shoulder. Same --nav-panel-* /
   --nav-fg-* variables as NAV_LINK, inherited from the band, so the flyout
   automatically matches whichever mode set them. */
export const FLYOUT_PANEL =
    "absolute z-[42] min-w-[140px] max-w-[280px] rounded-[6px] border border-solid border-[var(--nav-panel-border)] bg-[var(--nav-panel-bg)] p-[10px] text-left shadow-[0_3px_10px_rgba(0,0,0,0.1)] transition-[opacity,transform] duration-200 ease-out";
export const FLYOUT_LINK =
    "block px-[10px] py-[6px] text-[14px] uppercase leading-[1.4] text-[var(--nav-fg)] no-underline transition-colors duration-100 ease-in hover:text-[var(--nav-fg-hover)] focus-visible:text-[var(--nav-fg-hover)] active:text-[var(--nav-fg-active)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-fg-hover)]";

/* Lives inside the DRAWER (pine-dark) panel, which sets DARK_SURFACE_VARS:
   bone text, moss-light hover/focus (9.37:1). */
export const MOBILE_LINK =
    "block py-[0.9em] pr-5 text-[14px] uppercase text-[var(--nav-fg)] no-underline transition-colors duration-100 ease-in hover:text-[var(--nav-fg-hover)] focus-visible:text-[var(--nav-fg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--nav-fg-hover)]";
/* Icon-only buttons in the drawer (expand chevrons, the × close). */
export const MOBILE_ICON_BUTTON =
    "text-[var(--nav-fg)] transition-colors duration-100 ease-in hover:text-[var(--nav-fg-hover)] focus-visible:text-[var(--nav-fg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--nav-fg-hover)]";

/* The theme switch at the end of the nav. Inherits the same --nav-fg-*
   variables as NAV_LINK, so it stays in step with light/dark automatically —
   including its own icon, which would otherwise render an ink-on-ink glyph
   invisible against the dark band. Square rather than text-padded, since it
   holds a 16px glyph. */
export const NAV_THEME_TOGGLE =
    "flex h-[50px] w-[44px] cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[var(--nav-fg)] transition-colors duration-100 ease-in hover:text-[var(--nav-fg-hover)] focus-visible:text-[var(--nav-fg-hover)] active:text-[var(--nav-fg-active)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-fg-hover)] max-[1309px]:w-[38px] max-[829px]:w-[34px]";

/* ------------------------------------------------------------------ *
 * Account control (top-right of the masthead).
 *
 * Every colour here rides the same --nav-* variables the band sets, so the
 * whole control tracks light/dark without nextTheme threaded through it —
 * pine accents on bone, moss-light on the dark band, exactly like the nav.
 * ------------------------------------------------------------------ */

/* Signed-out sign-in affordance. An outlined pill (not a filled CTA):
   quieter than a primary button and harmonious with the header rather than
   shouting from the corner. Pine border/text on bone is 7.76:1; on the dark
   band the same variable resolves to moss-light at 10.83:1 — both clear AA.
   The colour-mix hover tint is a faint wash of whichever accent is live. */
export const ACCOUNT_LOGIN_PILL =
    "inline-flex items-center gap-[8px] whitespace-nowrap rounded-[6px] border-[1.5px] border-solid border-[var(--nav-fg-hover)] bg-transparent px-[18px] py-[8px] text-[13.5px] font-bold uppercase leading-none text-[var(--nav-fg-hover)] no-underline transition-colors duration-100 ease-in hover:bg-[color-mix(in_srgb,var(--nav-fg-hover)_12%,transparent)] active:text-[var(--nav-fg-active)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-fg-hover)]";

/* Signed-in trigger: avatar + first name + chevron. Name colour is the nav's
   rest ink/bone; the whole thing gets a faint hover ground so it reads as a
   button, matching the flyout triggers. */
export const ACCOUNT_TRIGGER =
    "flex items-center gap-[9px] cursor-pointer rounded-[8px] border-0 bg-transparent py-[5px] pl-[5px] pr-[8px] text-[var(--nav-fg)] transition-colors duration-100 ease-in hover:bg-[color-mix(in_srgb,var(--nav-fg)_8%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-fg-hover)]";
/* The first name drops out below 1100px (avatar + chevron only), which both
   frees room for the nav through the pinch zone and is a conventional compact
   header form; the full name still shows in the dropdown. */
export const ACCOUNT_TRIGGER_NAME =
    "whitespace-nowrap text-[14px] font-bold text-[var(--nav-fg)] max-[1099px]:hidden";

/* The avatar chip. Accent ground with accent-foreground initials (bone on
   pine 7.76:1; ink on moss-light 8.76:1) and is replaced by the member's
   photo when set. */
export const ACCOUNT_AVATAR =
    "flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--nav-fg-hover)] text-[13px] font-bold uppercase leading-none text-[var(--nav-accent-fg)]";

/* Dropdown panel. Same card/dark-panel ground and 1px edge as the nav flyout
   (FLYOUT_PANEL), right-anchored so it can never leave the viewport — the
   trigger already sits against the band's right padding, so the panel only
   ever grows leftward and downward. */
export const ACCOUNT_MENU =
    "absolute right-0 top-[calc(100%+8px)] z-[42] w-[250px] rounded-[6px] border border-solid border-[var(--nav-panel-border)] bg-[var(--nav-panel-bg)] p-[8px] text-left shadow-[0_8px_26px_rgba(0,0,0,0.16)]";
/* Menu rows are sentence-case actions (not uppercase nav labels), matching the
   dashboard's own account menu so a member meets the same vocabulary in both
   places. Accent icon + hover, inherited from --nav-fg-hover. */
export const ACCOUNT_MENU_ITEM =
    "flex items-center gap-[11px] rounded-[6px] px-[10px] py-[9px] text-[13.5px] font-semibold text-[var(--nav-fg)] no-underline transition-colors duration-100 ease-in hover:bg-[color-mix(in_srgb,var(--nav-fg-hover)_10%,transparent)] hover:text-[var(--nav-fg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--nav-fg-hover)]";
export const ACCOUNT_MENU_SEP =
    "my-[4px] mx-[4px] h-px bg-[color-mix(in_srgb,var(--nav-fg)_14%,transparent)]";

/* Mobile account block, inside the DRAWER (pine-dark, DARK_SURFACE_VARS). The
   signed-out CTA is the dark-ground primary — moss-light fill with ink text
   (8.76:1), moss on hover (ink 5.80:1) — the one place the account control
   leans loud, because on a phone it is the primary next step. */
export const ACCOUNT_MOBILE_CTA =
    "flex items-center justify-center gap-[8px] rounded-[7px] bg-[var(--nav-fg-hover)] px-[16px] py-[12px] text-[13px] font-bold uppercase leading-none tracking-[0.02em] text-[var(--nav-accent-fg)] no-underline transition-colors duration-100 ease-in hover:bg-[var(--nav-fg-active)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-fg-hover)]";
export const ACCOUNT_MOBILE_LINK =
    "flex items-center gap-[12px] py-[11px] pr-5 text-[14px] uppercase text-[var(--nav-fg)] no-underline transition-colors duration-100 ease-in hover:text-[var(--nav-fg-hover)] focus-visible:text-[var(--nav-fg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--nav-fg-hover)]";
