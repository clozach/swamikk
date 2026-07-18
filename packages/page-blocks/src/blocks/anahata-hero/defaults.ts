import type {
    BannerFit,
    BannerPosition,
    CtaStyle,
    HeroAnimation,
    HeroImage,
    HeroParagraph,
    ImageSource,
} from "./settings";

/* ------------------------------------------------------------------ *
 * Anahata palette — every value read out of the live stylesheet.
 * Kept here (not in tokens.css) because page-blocks ships its own
 * Tailwind build and never loads the design-system stylesheet.
 * ------------------------------------------------------------------ */
export const CREAM = "#f7f4eb"; // page ground
export const INK = "#545454"; // body copy
export const RUST = "#993300"; // display headings, hover
export const SAFFRON = "#ff9900"; // links, buttons
export const RUST_PRESSED = "#7a2900"; // derived: rust darkened ~12% for :active

/* ---- banner band ---- */
export const bannerAspectRatio = "1920 / 947"; // revslider natural size
export const bannerMinHeight = 220; // px floor on narrow screens
export const bannerFit: BannerFit = "cover";
export const bannerPosition: BannerPosition = "center";
export const wordmarkMaxWidth = 835; // natural width of the wordmark PNG
export const animation: HeroAnimation = "fade";

const url = (value: string): ImageSource => ({ kind: "url", url: value });

export const bannerImage: HeroImage = {
    source: url("/anahata/hero-silentmed.jpg"),
    alt: "",
};

export const wordmark: HeroImage = {
    source: url("/anahata/solutions-for-life.png"),
    alt: "Anahata Yoga — Solutions For Life",
};

export const photo: HeroImage = {
    source: url("/anahata/hero-silentmed.jpg"),
    alt: "Silent meditation at Anahata Yoga Retreat",
};

/** Two 32px spacers sat above the photo column on the real site. */
export const photoOffsetTop = 64;

/* ---- copy ---- */
export const heading = "Welcome to Anahata";

export const paragraphs: HeroParagraph[] = [
    {
        text: "The Anahata Yoga Health & Education Trust is a non-profit, charitable, organisation dedicated to sharing the traditional practices of yoga. Our community lives in accordance with authentic yoga lifestyle and Eco principles. We are committed to living simply and sustainably; in harmony with nature and one another.",
        linkText: "The Anahata Yoga Health & Education Trust",
        linkHref: "#",
    },
    {
        text: "Situated in New Zealand's luscious native forest, with spectacular views over Golden Bay, Anahata offers a sanctuary space in which to cultivate personal growth, facilitate healing and discover who you really are.",
    },
    {
        text: "We welcome you to join us in experiencing the health and well-being that comes from living in a supportive, inspiring and dynamic environment.",
    },
];

/* ---- call to action (off by default; the real hero has no button) ---- */
export const ctaCaption = "";
export const ctaAction = "#";
export const ctaStyle: CtaStyle = "saffron";

/* ---- design ---- */
export const groundColor = CREAM;
export const headingColor = RUST;
export const bodyColor = INK;

/**
 * Saffron matches the live site (`[25_all.css:3] a { color: #ff9900 }`) but
 * only reaches 1.95:1 against the cream ground, so 14px link text fails
 * WCAG AA. Rust hover is 6.75:1 and passes. Both are settings — flip
 * `linkColor` to RUST if accessibility should win over fidelity.
 */
export const linkColor = SAFFRON;
export const linkHoverColor = RUST;
