import React from "react";
import { FONT_BODY, PALETTE } from "./palette";
import { WAITING_LABEL } from "./image-source";

export type WaitingForAssetTone = "light" | "dark";

export interface WaitingForAssetProps {
    /** What the final photo should show. Carried in `aria-label` + `title`. */
    description: string;
    /** Corner-tag text. Default "waiting for asset". */
    label?: string;
    /** Merged on the root, so a block can hand over its own sizing class. */
    className?: string;
    /** Merged last — width/height/aspectRatio below are conveniences. */
    style?: React.CSSProperties;
    /** px number or any CSS length. */
    width?: number | string;
    height?: number | string;
    /** CSS `aspect-ratio` value, e.g. "768 / 570". */
    aspectRatio?: string;
    /** `position: absolute; inset: 0` — for every background/cover well. */
    fill?: boolean;
    /** Light grounds (bone, card, fern) or the dark close (pine-dark). */
    tone?: WaitingForAssetTone;
    id?: string;
}

const toLength = (value: number | string | undefined) =>
    typeof value === "number" ? `${value}px` : value;

/**
 * Palette defaults, injected as `--ayr-well-*-default` custom properties so
 * the well never depends on the site theme. The stylesheet consumes
 * `var(--ayr-well-<x>, var(--ayr-well-<x>-default))`, so a parent overrides
 * a colour by setting `--ayr-well-<x>` on any ancestor or via `style`.
 */
const TONES: Record<WaitingForAssetTone, Record<string, string>> = {
    light: {
        "--ayr-well-ground-default": PALETTE.wellGround,
        "--ayr-well-edge-default": PALETTE.wellEdge,
        "--ayr-well-text-default": PALETTE.ink,
        "--ayr-well-tag-bg-default": PALETTE.wellEdge,
        "--ayr-well-tag-text-default": PALETTE.bone,
    },
    dark: {
        "--ayr-well-ground-default": PALETTE.wellGroundDark,
        "--ayr-well-edge-default": PALETTE.wellEdgeDark,
        "--ayr-well-text-default": PALETTE.footerText,
        "--ayr-well-tag-bg-default": PALETTE.wellEdgeDark,
        "--ayr-well-tag-text-default": PALETTE.pineDark,
    },
};

/**
 * The waiting-for-asset well.
 *
 * Occupies exactly the box it is given and nothing else: pass `fill` inside
 * a positioned box, or `width`/`height`/`aspectRatio`, or a `className` that
 * already sizes the element. The root is a size container (`container-type:
 * size`), so it MUST get both dimensions from outside — content never sizes
 * it, which is the point: the well is the image's box, judged before the
 * image exists. Size tiers are pure CSS (see `styles.css`): ≥168×84 shows
 * tag + glyph + description; ≥100×44 shows tag + glyph; smaller shows the
 * glyph alone. The description is always in `aria-label` and `title`.
 *
 * Never renders an `<img>`; SSR-safe; no JS.
 */
export function WaitingForAsset({
    description,
    label = WAITING_LABEL,
    className,
    style,
    width,
    height,
    aspectRatio,
    fill = false,
    tone = "light",
    id,
}: WaitingForAssetProps) {
    const text = (description ?? "").trim();
    const name = text || label;
    const classes = [
        "ayr-well",
        tone === "dark" && "ayr-well--dark",
        fill && "ayr-well--fill",
        className,
    ]
        .filter(Boolean)
        .join(" ");

    const inline = {
        "--ayr-well-font-default": FONT_BODY,
        ...TONES[tone],
        ...(fill
            ? {}
            : {
                  width: toLength(width),
                  height: toLength(height),
                  aspectRatio,
              }),
        ...style,
    } as React.CSSProperties;

    return (
        <div
            id={id}
            className={classes}
            style={inline}
            role="img"
            aria-label={name}
            title={name}
            data-asset="waiting"
            data-tone={tone}
        >
            <span className="ayr-well__tag" aria-hidden="true">
                {label}
            </span>
            <div className="ayr-well__body" aria-hidden="true">
                <svg
                    className="ayr-well__glyph"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    focusable="false"
                    aria-hidden="true"
                >
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <circle cx="9" cy="9.5" r="1.75" />
                    <path d="M21 16l-5-5-6 6-2.5-2.5L3 19" />
                </svg>
                {text ? <p className="ayr-well__desc">{text}</p> : null}
            </div>
        </div>
    );
}

export default WaitingForAsset;
