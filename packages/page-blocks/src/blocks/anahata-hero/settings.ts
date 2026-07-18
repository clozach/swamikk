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

/** The three real button recipes from the Anahata stylesheet. */
export type CtaStyle = "saffron" | "saffron-big" | "white";

export default interface Settings extends WidgetDefaultSettings {
    /* ---- full-bleed banner band ---- */
    bannerImage?: HeroImage;
    bannerFit?: BannerFit;
    bannerPosition?: BannerPosition;
    /** Aspect ratio of the band, as a CSS `aspect-ratio` value. */
    bannerAspectRatio?: string;
    /** Floor (px) so the band never collapses on narrow screens. */
    bannerMinHeight?: number;
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
     * ground — far under the WCAG AA 4.5:1 floor for 14px text — so this is a
     * setting rather than a constant. The default keeps brand fidelity; switch
     * it to the rust (#993300, 6.75:1) to make the copy accessible.
     */
    linkColor?: string;
    linkHoverColor?: string;
    cssId?: string;
}
