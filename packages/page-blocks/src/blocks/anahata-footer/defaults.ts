import type { BackToTop, FooterColumn } from "./settings";

/* ------------------------------------------------------------------
   Type — the two families that actually load on anahata-retreat.org.nz.
   The site's CSS also names Lato and PT Sans but never fetches them, so
   Open Sans is what renders and what the design system codifies.
   ------------------------------------------------------------------ */
export const FONT_DISPLAY =
    'var(--font-playfair-display), "Playfair Display", Georgia, serif';
export const FONT_BODY =
    'var(--font-open-sans), "Open Sans", -apple-system, "Segoe UI", sans-serif';

/* ------------------------------------------------------------------
   Palette — anahata-design-system/tokens.css
   ------------------------------------------------------------------ */
/** --ocean: footer ground. */
export const OCEAN = "#216097";
/** --navy: copyright strip. */
export const NAVY = "#012772";
/**
 * Lightened ocean, used only for the footer menu hairlines. The original
 * `#5988b1` measured 1.75:1 against the ocean ground — under the 3:1
 * non-text/UI-component floor these rules act as list-item boundaries for.
 * `#9ac1dc` reaches 3.47:1 while staying in the same lightened-ocean family.
 */
export const OCEAN_HAIRLINE = "#9ac1dc";
export const WHITE = "#ffffff";
/** --ink, resting colour of the back-to-top glyph. */
export const INK = "#545454";

/* ------------------------------------------------------------------
   Measure & rhythm — read out of the site's own stylesheet.
   ------------------------------------------------------------------ */
export const INNER_MAX_WIDTH = 1024;
export const PADDING_TOP = 45;
export const PADDING_BOTTOM = 45;
/** Gutter between footer columns (the theme's `gap-30` row). */
export const COLUMN_GAP = 30;
/** Bottom padding on each widget inside a column. */
export const WIDGET_PADDING_BOTTOM = 40;
/** Playfair column titles. */
export const COLUMN_TITLE_SIZE = 30;
/** Contact column's sentence-case heading. */
export const CONTACT_HEADING_SIZE = 18;
/** Social buttons: 32px circles with a 2px ring and a 16px glyph. */
export const SOCIAL_BUTTON_SIZE = 32;
export const SOCIAL_GLYPH_SIZE = 16;
export const SOCIAL_GAP = 7;
/** Copyright strip. */
export const COPYRIGHT_FONT_SIZE = 12;
export const COPYRIGHT_LINE_HEIGHT = 18;
/** Back-to-top control. */
export const BACK_TO_TOP_SIZE = 35;
export const BACK_TO_TOP_OFFSET = 25;

/* ------------------------------------------------------------------
   Decorative edges. Staged under apps/web/public/anahata/.
   ------------------------------------------------------------------ */
export const decorLeftUrl = "/anahata/footer-bg-left.png";
export const decorRightUrl = "/anahata/footer-bg-right.png";
/** Natural sizes, used as the decorative columns' widths. */
export const DECOR_LEFT_WIDTH = 322;
export const DECOR_RIGHT_WIDTH = 387;

/* ------------------------------------------------------------------
   Copy. Verbatim from the live footer.
   ------------------------------------------------------------------ */
export const copyrightPrefix = "Copyright © 2026";
export const copyrightOwner = "Anahata Yoga Retreat";
export const copyrightLinkPrefix = "";
export const copyrightLinkLabel = "";
export const copyrightLinkHref = "";

export const backToTop: BackToTop = {
    enabled: true,
    label: "Back To Top",
    revealAfter: 100,
};

/**
 * The three columns as the live site lists them. Ids are literals, not
 * generated, so server and client renders agree.
 *
 * Native membership help and policies stay on this site. Retreat links
 * lead to the verified Anahata website, with a visible external-site cue.
 */
export const columns: FooterColumn[] = [
    {
        kind: "links",
        id: "col-anahata-site",
        title: "Anahata Site",
        links: [
            {
                id: "lnk-stay",
                label: "Stay ↗",
                href: "https://www.anahata-retreat.org.nz/stay",
            },
            {
                id: "lnk-yoga",
                label: "Yoga ↗",
                href: "https://www.anahata-retreat.org.nz/yoga",
            },
            {
                id: "lnk-about",
                label: "About ↗",
                href: "https://www.anahata-retreat.org.nz/about",
            },
            {
                id: "lnk-give",
                label: "Give ↗",
                href: "https://www.anahata-retreat.org.nz/give",
            },
            { id: "lnk-blog", label: "Blog", href: "/blog" },
            { id: "lnk-contact", label: "Help & contact", href: "/p/contact" },
            {
                id: "lnk-faqs",
                label: "Retreat FAQs ↗",
                href: "https://www.anahata-retreat.org.nz/stay/faqs",
            },
        ],
    },
    {
        kind: "links",
        id: "col-gatherings",
        title: "Gatherings",
        links: [
            {
                id: "lnk-events-trainings",
                label: "Anahata Events and Trainings ↗",
                href: "https://www.anahata-retreat.org.nz/gatherings",
            },
            {
                id: "lnk-past-gatherings",
                label: "Past Gatherings ↗",
                href: "https://www.anahata-retreat.org.nz/gatherings/past-gatherings",
            },
            {
                id: "lnk-cancellation",
                label: "Cancellation/Refund Policy",
                href: "/p/terms",
            },
            { id: "lnk-privacy", label: "Privacy Policy", href: "/p/privacy" },
        ],
    },
    {
        kind: "contact",
        id: "col-contact",
        title: "",
        logoUrl: "/anahata/footer-logo-2021.png",
        logoAlt: "Anahata Yoga Retreat",
        logoWidth: 150,
        logoHeight: 168,
        heading: "Anahata Yoga Retreat",
        addressLines: [
            "PO Box 155,",
            "Takaka, Golden Bay,",
            "New Zealand 7142",
        ],
        emailLabel: "Email",
        email: "clozach+kk@gmail.com",
        socials: [
            {
                id: "soc-facebook",
                platform: "facebook",
                href: "https://www.facebook.com/anahatayogaretreatnz/",
            },
            {
                id: "soc-instagram",
                platform: "instagram",
                href: "https://www.instagram.com/anahatayogaretreatnz/",
            },
            {
                id: "soc-youtube",
                platform: "youtube",
                href: "https://www.youtube.com/channel/UCpco9cWH-8BUFdlk6DjaJPQ",
            },
            {
                id: "soc-vimeo",
                platform: "vimeo",
                href: "https://vimeo.com/user30461373",
            },
        ],
    },
];
