import { Media, WidgetDefaultSettings } from "@courselit/common-models";

/**
 * Where a picture comes from.
 *
 * A picture is EITHER a hand-typed URL (the staged Anahata assets live at
 * same-origin `/anahata/<file>`) OR an item picked from the media library —
 * never both, and never neither. Modelling it as a tagged union keeps the
 * "url set but media also set" state unrepresentable.
 */
export type ImageSource =
    | { kind: "url"; url: string }
    | { kind: "media"; media: Partial<Media> };

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

/** The three real button recipes from the Anahata stylesheet. */
export type CtaStyle = "saffron" | "saffron-big" | "white";

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

    /* ---- "Welcome to Anahata" row ---- */
    heading?: string;
    paragraphs?: HeroParagraph[];
    photo?: HeroImage;
    /** Top offset (px) of the photo column on desktop only. */
    photoOffsetTop?: number;
    ctaCaption?: string;
    ctaAction?: string;
    ctaStyle?: CtaStyle;

    /* ---- design ---- */
    /** Page ground behind the whole block. Anahata cream by default. */
    groundColor?: string;
    headingColor?: string;
    bodyColor?: string;
    /**
     * Inline links in the body copy.
     *
     * The site's own saffron (#ff9900) scores only 1.95:1 against the cream
     * ground — under the WCAG AA 4.5:1 floor for body text, and still under
     * the 3:1 large-text floor, so no size makes it compliant here. The
     * default is now rust (#993300, 6.75:1); this stays a setting so an
     * admin can still dial in the literal site colour if they choose.
     */
    linkColor?: string;
    linkHoverColor?: string;
    cssId?: string;
}
