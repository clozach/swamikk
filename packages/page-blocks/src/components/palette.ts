/**
 * swamikk design system — v1.0 tokens (2026-09-10), as constants.
 *
 * Mirrors `swamikk-design-system/tokens.json` byte for byte so a block can
 * paint from the palette without depending on the site's stylesheet being
 * loaded. Contrast pairings are recorded in `tokens.css`; every value here
 * was measured there, so change them together or not at all.
 */
export const PALETTE_VERSION = "1.0";

export const PALETTE = {
    /* the ground */
    bone: "#e4e9d8",
    card: "#f8f9f5",
    fern: "#d6e0c3",
    wellGround: "#dde3d2",
    /* ink */
    ink: "#262b27",
    inkSoft: "#4a534d",
    /* the two voices */
    pine: "#1f4d3b",
    pineDeep: "#153627",
    moss: "#9aab74",
    mossLight: "#c2cfa6",
    /* edges */
    edge: "#6f7d6b",
    wellEdge: "#5b6b59",
    /* the dark close */
    pineDark: "#12291f",
    strip: "#0b1b14",
    footerText: "#e4e9d8",
    footerEdge: "#6b8776",
    wellEdgeDark: "#a9bba0",
    wellGroundDark: "#1d3a2c",
} as const;

export type PaletteToken = keyof typeof PALETTE;

/** Playfair Display speaks. */
export const FONT_DISPLAY = '"Playfair Display", Georgia, serif';
/** Open Sans works. */
export const FONT_BODY = '"Open Sans", -apple-system, "Segoe UI", sans-serif';
