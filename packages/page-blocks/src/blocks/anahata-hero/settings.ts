import { WidgetDefaultSettings } from "@courselit/common-models";
import type { ImageSource } from "../../components/image-source";

/**
 * Where a picture comes from — the shared tagged union (URL · media-library
 * item · placeholder-with-description). Re-exported so existing imports of
 * `ImageSource` from this block keep resolving.
 */
export type { ImageSource };

export interface HeroImage {
    source: ImageSource;
    /** Empty string is legitimate — it marks the image as decorative. */
    alt: string;
}

/**
 * One body paragraph.
 *
 * When `linkText` is a non-empty substring of `text` and `linkHref` is set,
 * that run of text renders as an inline anchor. Anything else renders as
 * plain text, so a half-filled link can never produce a broken anchor.
 */
export interface HeroParagraph {
    text: string;
    linkText?: string;
    linkHref?: string;
}

/** How the banner photo fills its band. */
export type BannerFit = "cover" | "contain";

/**
 * How tall the banner band is.
 *
 * "full-screen" fills the viewport below the site header — `100svh`
 * (`100vh` fallback) minus the header's own live height, matching the real
 * site. "fixed" uses `bannerAspectRatio` sized off the band's width, floored
 * by `bannerMinHeight`, for an admin who wants a shorter, proportional band.
 */
export type BannerHeightMode = "full-screen" | "fixed";

/** Focal point of the banner photo. */
export type BannerPosition =
    | "center"
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "top left"
    | "top right"
    | "bottom left"
    | "bottom right";

/** Entrance treatment for the banner. Pure CSS — never JS-gated. */
export type HeroAnimation = "none" | "fade";

/**
 * How the banner behaves. `static` (the default when absent) is today's
 * single-photo hero. `social-rotation` draws a photo pool from the admin's
 * social feeds and rotates client-side; the stored `bannerImage` stays as
 * frame 0 and the permanent fallback, so a feed outage never breaks the hero.
 * Tagged union so the two modes can never be half-configured into each other.
 */
export type BannerMode = { kind: "static" } | { kind: "social-rotation" };

/**
 * Button recipes. `pine` (primary: pine fill, bone text) and `moss`
 * (secondary: moss fill, ink text, pine edge) are the swamikk v1.0 pair.
 * The three older Anahata names still resolve — `saffron` and `saffron-big`
 * now paint the pine recipe (regular / large), `white` the outline recipe —
 * so a stored layout keeps rendering without ever showing the old palette.
 */
export type CtaStyle = "saffron" | "saffron-big" | "white" | "pine" | "moss";

/** Which side of the welcome text the photo column sits on (md and up). */
export type PhotoPosition = "left" | "right";

export default interface Settings extends WidgetDefaultSettings {
    /* ---- full-bleed banner band ---- */
    bannerImage?: HeroImage;
    bannerFit?: BannerFit;
    bannerPosition?: BannerPosition;
    /** Full-screen (default) vs a fixed, proportionally-sized band. */
    bannerHeightMode?: BannerHeightMode;
    /** Aspect ratio of the band in "fixed" mode, as a CSS `aspect-ratio` value. */
    bannerAspectRatio?: string;
    /** Floor (px) so the band never collapses on narrow screens, either mode. */
    bannerMinHeight?: number;
    /** Static single photo (default) vs pool-driven social rotation. */
    bannerMode?: BannerMode;
    /** Wordmark laid over the banner. Omit to show the banner bare. */
    wordmark?: HeroImage;
    /** Natural width (px) of the wordmark; it is clamped to the band. */
    wordmarkMaxWidth?: number;
    animation?: HeroAnimation;

    /* ---- welcome row ---- */
    /** Small-caps line above the heading, e.g. "with Swami Karma Karuna". */
    kicker?: string;
    heading?: string;
    /**
     * The strip under the heading — one word per entry, typeset as a
     * wrapping dotted line ("Mentoring · Coaching · …"). Empty hides it.
     */
    offerings?: string[];
    paragraphs?: HeroParagraph[];
    /**
     * Index into `paragraphs` of the one set as the display lede (Playfair,
     * larger, in the heading colour). Out of range or negative = none.
     */
    ledeParagraphIndex?: number;
    photo?: HeroImage;
    /** Which side the photo column sits on at md and up. Stacked on phones. */
    photoPosition?: PhotoPosition;
    /** Top offset (px) of the photo column on desktop only. */
    photoOffsetTop?: number;
    ctaCaption?: string;
    ctaAction?: string;
    ctaStyle?: CtaStyle;
    /** Second button, always the moss recipe. Empty caption hides it. */
    secondaryCtaCaption?: string;
    secondaryCtaAction?: string;

    /* ---- design ---- */
    /** Page ground behind the whole block. Bone by default. */
    groundColor?: string;
    headingColor?: string;
    bodyColor?: string;
    /**
     * Inline links in the body copy. Pine by default (8.22:1 on bone); links
     * are always underlined because pine against ink is only 1.5:1, so colour
     * alone could never carry them.
     */
    linkColor?: string;
    linkHoverColor?: string;
    cssId?: string;
}
