import { placeholderSource } from "../../components/image-source";
import { PALETTE } from "../../components/palette";
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
   Palette — swamikk design-system v1.0 (components/palette.ts), AA-checked
   with the WCAG relative-luminance formula against the exact hexes:
     bone on pine-dark 12.44:1 (text) · moss-light on pine-dark 9.37:1
     (link hover, focus ring) · footer-edge on pine-dark 3.93:1 (hairlines,
     non-text floor 3:1) · bone on strip 14.35:1 · moss-light on strip
     10.81:1 · back-to-top: pine on bone 7.76:1, bone on pine 7.76:1,
     bone on pine-deep 10.67:1.
   ------------------------------------------------------------------ */
/** --pine-dark: footer ground, the palette's dark close. */
export const GROUND = PALETTE.pineDark;
/** --strip: copyright strip, one step darker than the ground. */
export const STRIP = PALETTE.strip;
/** --footer-text: bone, on the pine-dark ground. */
export const TEXT = PALETTE.footerText;
/** --footer-edge: the menu-list rules. */
export const HAIRLINE = PALETTE.footerEdge;
/** --moss-light: link hover/active text and every focus ring. */
export const LINK_HOVER = PALETTE.mossLight;

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
   Decorative edges. The two side ornaments (`footer-bg-left/right.png`)
   carried the old brand's colour baked into the raster, so they ship off:
   an empty URL renders nothing. An editor can paint one back in from the
   Decorative edges panel.
   ------------------------------------------------------------------ */
export const decorLeftUrl = "";
export const decorRightUrl = "";
/** Natural sizes of the old ornaments, used as the decorative columns'
    widths when a URL is set. */
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
        // The mark has not been drawn yet, so the 150 × 168 slot renders as
        // a waiting-for-asset well on the dark ground (spec § 7) until a real
        // file is uploaded. Columns still storing the legacy `logoUrl` keep
        // rendering it.
        logoSource: placeholderSource(
            "Swami Karma Karuna mark, larger — the same lotus or monogram as the header, reversed for a dark ground.",
        ),
        logoAlt: "Swami Karma Karuna",
        logoWidth: 150,
        logoHeight: 168,
        heading: "Swami Karma Karuna",
        addressLines: [
            "Anahata Yoga Retreat",
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
