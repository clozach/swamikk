/**
 * swamikk design system — v1.1 tokens (2026-09-14, "Clay & Saffron"), as
 * constants. Earth tones replace the v1.0 greens (Al, 2026-09-14: "more earth
 * tones, with a distinct accent of Swami's favorite orange"); layout, type and
 * shapes are unchanged, so the KEYS keep their v1.0 names as ROLES — `pine` is
 * the authority voice (now umber), `moss` the energy voice (now saffron),
 * `fern` the band, `bone` the ground. Renaming the keys is a separate,
 * mechanical change; the hues had to move now.
 *
 * Mirrors `swamikk-design-system/tokens.json` byte for byte so a block can
 * paint from the palette without depending on the site's stylesheet being
 * loaded. Contrast pairings are recorded in `tokens.css`; every value here
 * was measured there, so change them together or not at all.
 */
export const PALETTE_VERSION = "1.1";

export const PALETTE = {
    /* the ground — warm sand; a whiter card; a clay band */
    bone: "#ebe4d6",
    card: "#faf7f1",
    fern: "#e2d6c1",
    wellGround: "#e3d9c8",
    /* ink — warm, near-black brown */
    ink: "#2a2420",
    inkSoft: "#5b5048",
    /* the two voices: umber = authority (display, links, primary fill,
       focus ring); saffron = energy (secondary fill, tags), never text on
       a light ground */
    pine: "#5b3d2a",
    pineDeep: "#3f2a1c",
    moss: "#ff9900",
    mossLight: "#ffb84d",
    /* edges */
    edge: "#82725f",
    wellEdge: "#6f5f50",
    /* the dark close — deep brown, not green */
    pineDark: "#2f2118",
    strip: "#1e150f",
    footerText: "#ebe4d6",
    footerEdge: "#8c7a68",
    wellEdgeDark: "#b7a48f",
    wellGroundDark: "#3b2b20",
} as const;

export type PaletteToken = keyof typeof PALETTE;

/** Playfair Display speaks. */
export const FONT_DISPLAY = '"Playfair Display", Georgia, serif';
/** Open Sans works. */
export const FONT_BODY = '"Open Sans", -apple-system, "Segoe UI", sans-serif';
