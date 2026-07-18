import type {
    BannerFit,
    BannerHeightMode,
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
export const RUST = "#993300"; // display headings, links (6.75:1 on cream)
export const SAFFRON = "#ff9900"; // button/table fills — never text on cream/white
export const RUST_PRESSED = "#7a2900"; // derived: rust darkened ~12% for :active (8.90:1 on cream)

/* ---- banner band ---- */
/**
 * Default band height: full viewport height below the site header, matching
 * the real site. "fixed" falls back to `bannerAspectRatio` + `bannerMinHeight`
 * for an admin who wants a shorter, proportionally-sized band instead.
 */
export const bannerHeightMode: BannerHeightMode = "full-screen";
export const bannerAspectRatio = "1920 / 947"; // revslider natural size; used in "fixed" mode
export const bannerMinHeight = 220; // px floor on narrow screens, both modes
export const bannerFit: BannerFit = "cover";
export const bannerPosition: BannerPosition = "center";
export const wordmarkMaxWidth = 835; // natural width of the wordmark PNG
export const animation: HeroAnimation = "fade";

const url = (value: string): ImageSource => ({ kind: "url", url: value });

/**
 * `hp-hero-bg.jpg` (1920x947, same aspect ratio as the old placeholder) —
 * distinct from `photo` below so the banner and the "Welcome to Anahata"
 * section never show the same picture.
 */
export const bannerImage: HeroImage = {
    source: url("/anahata/hp-hero-bg.jpg"),
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
 * The live site's `a { color: #ff9900 }` measures 1.95:1 against the cream
 * ground — even at 60px display size it would need 3:1 and still misses,
 * so there is no size at which saffron qualifies here. The default is rust
 * (6.75:1); hover deepens to rust-pressed (8.90:1) rather than repeating
 * rust, so the two states stay visually distinct. Both remain settings —
 * an admin who wants the literal site colour back can still pick it.
 */
export const linkColor = RUST;
export const linkHoverColor = RUST_PRESSED;
