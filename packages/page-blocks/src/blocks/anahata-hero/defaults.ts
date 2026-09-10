import type {
    BannerFit,
    BannerHeightMode,
    BannerMode,
    BannerPosition,
    CtaStyle,
    HeroAnimation,
    HeroImage,
    HeroParagraph,
    PhotoPosition,
} from "./settings";
import { placeholderSource } from "../../components/image-source";
import { PALETTE } from "../../components/palette";

/*
 * Every colour below is a swamikk v1.0 role (components/palette.ts). Only
 * lowercase exports reach the content-changes preview (`pagePreviewSettings`
 * filters on /^[a-z]/), so helpers and constants stay capitalised or local.
 */

/* ---- banner band ---- */
/**
 * Default band height: full viewport height below the site header, matching
 * the real site. "fixed" falls back to `bannerAspectRatio` + `bannerMinHeight`
 * for an admin who wants a shorter, proportionally-sized band instead.
 */
export const bannerHeightMode: BannerHeightMode = "full-screen";
export const bannerAspectRatio = "1920 / 947"; // used in "fixed" mode
export const bannerMinHeight = 220; // px floor on narrow screens, both modes
export const bannerFit: BannerFit = "cover";
/** Static single photo by default — social rotation is opt-in per block. */
export const bannerMode: BannerMode = { kind: "static" };
export const bannerPosition: BannerPosition = "center";
export const wordmarkMaxWidth = 835; // natural width of the wordmark lockup
/** The wordmark's box (spec § 1: "wide, about 835 × 120"). */
export const WORDMARK_ASPECT_RATIO = "835 / 120";
/** The welcome photo's box (spec § 1: "3:2, the column beside the text"). */
export const PHOTO_ASPECT_RATIO = "3 / 2";
export const animation: HeroAnimation = "fade";

/**
 * Every picture starts as a waiting-for-asset well carrying the photo idea
 * from `homepage-redesign-spec.md § 1`, verbatim. A real photo replaces a
 * well through the ordinary image change.
 */
export const bannerImage: HeroImage = {
    source: placeholderSource(
        "Swami Karma Karuna teaching — seated, mid-gesture, eye contact with a student just out of frame. Warm natural light, indoors or on a veranda. Her face and hands are the subject. Not a landscape. Not the retreat buildings.",
    ),
    alt: "",
};

export const wordmark: HeroImage = {
    source: placeholderSource(
        "Wordmark lockup — 'Swami Karma Karuna' with 'Yoga Solutions for Life™' beneath it. Flat vector, one ink colour, transparent background.",
    ),
    alt: "Swami Karma Karuna — Yoga Solutions for Life",
};

export const photo: HeroImage = {
    source: placeholderSource(
        "Swami Karma Karuna in a quiet moment — close portrait, soft daylight, plain background. Relaxed, present, looking at the camera.",
    ),
    alt: "",
};

/** The photo column sits beside the text, vertically centred (no offset). */
export const photoOffsetTop = 0;
export const photoPosition: PhotoPosition = "right";

/* ---- copy (spec § 1, verbatim) ---- */
export const kicker = "with Swami Karma Karuna";
export const heading = "Yoga Solutions for Life";
export const offerings: string[] = [
    "Mentoring",
    "Coaching",
    "Teaching",
    "Membership",
    "Appearances",
];

export const paragraphs: HeroParagraph[] = [
    {
        text: "Swami Karma Karuna has taught yoga for more than twenty-five years in the Satyananda tradition of the Bihar School of Yoga, under the guidance of Swami Niranjanananda Saraswati. She is a founding member and director of Anahata Yoga Retreat in Golden Bay, New Zealand, and teaches in India for part of each year.",
        linkText: "Anahata Yoga Retreat",
        linkHref: "https://www.anahata-retreat.org.nz",
    },
    {
        text: "She works with people directly: one-to-one mentoring and coaching, yoga teaching online and in person, a membership with regular live sessions and a library of recorded practices, and appearances at retreats, trainings and events around the world.",
    },
    {
        text: "Simple, powerful techniques for transformation — practices that fit a real life, with family, work and everything else in it.",
    },
];

/** Paragraph 3 is the Playfair lede. */
export const ledeParagraphIndex = 2;

/* ---- calls to action ---- */
export const ctaCaption = "Explore the membership";
export const ctaAction = "/p/members-library-test";
export const ctaStyle: CtaStyle = "pine";
export const secondaryCtaCaption = "Book a private session";
export const secondaryCtaAction = "/p/private-sessions";

/* ---- design (swamikk v1.0 roles; ratios measured in tokens.css) ---- */
export const groundColor = PALETTE.bone;
export const headingColor = PALETTE.pine; // 8.22:1 on bone
export const bodyColor = PALETTE.ink; // 12.31:1 on bone
export const linkColor = PALETTE.pine;
export const linkHoverColor = PALETTE.pineDeep; // 11.29:1 on bone
