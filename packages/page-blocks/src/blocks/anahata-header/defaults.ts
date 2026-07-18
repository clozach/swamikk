import { MenuItem, TopBarItem } from "./settings";

/**
 * Defaults are the real Anahata Yoga Retreat header, verbatim.
 * IDs are stable literals (never generated) so server and client render the
 * same markup and so re-saving in the page builder does not churn keys.
 *
 * Link policy: only Blog (/blog) and Shop (/products) resolve to real
 * CourseLit routes today. Everything else is "#" — fully styled and
 * hoverable, waiting for Karuna to point it somewhere.
 */

export const sticky = true;

/* The site has no dark mode of its own, but CourseLit's theme does, and with
   the utility bar going away there is nowhere else in the chrome to reach it. */
export const showThemeToggle = true;
export const themeToggleLabel = "Toggle light and dark theme";

/* A small square mark sitting immediately left of the first nav item, not a
   free-standing wordmark row — the two read as one masthead line rather than
   a logo chip stacked above a menu. Served from the app image, not /anahata/
   (that dir holds the home-page-replica media specifically). */
export const logoSrc = "/swami-kk-logo.png";
export const logoAlt = "Swami Karma Karuna — home";
export const logoWidth = 40;
export const logoHeight = 40;
export const homeHref = "/";

/* The cocoa utility strip is off by default and ships with no items.
   It used to carry Cart / Search / Menu / Contact, copied from the live
   WordPress site where those are real WooCommerce and theme features. Here
   they were four `href: "#"` placeholders: Cart and Search have nothing to
   point at (this platform has no basket and no site search), and Menu and
   Contact duplicated the nav directly beneath them. A second row of chrome
   that looks like navigation and does nothing costs more than it earns.

   The strip itself stays configurable — if a real destination ever exists,
   add it in the block's settings. Defaults just don't invent one. */
export const showTopBar = false;

export const topBarLeftItems: TopBarItem[] = [];

export const topBarRightItems: TopBarItem[] = [];

export const mobileMenuLabel = "Menu";
export const mobileCtaLabel = "Contact";
export const mobileCtaHref = "#";
export const mobileCloseLabel = "Close mobile menu";

export const menu: MenuItem[] = [
    {
        id: "events",
        label: "Events and Trainings",
        href: "#",
        children: [
            { id: "events-upcoming", label: "Upcoming Events", href: "#" },
            { id: "events-past", label: "Past Events", href: "#" },
            { id: "events-venue", label: "Venue Hire", href: "#" },
        ],
    },
    {
        id: "stay",
        label: "Stay",
        href: "#",
        children: [
            {
                id: "stay-rentals",
                label: "Accommodation Rentals",
                href: "#",
            },
            { id: "stay-caretaker", label: "Caretaker", href: "#" },
            {
                id: "stay-getting-here",
                label: "Getting to Anahata",
                href: "#",
            },
            { id: "stay-what-to-bring", label: "What To Bring", href: "#" },
            { id: "stay-faqs", label: "FAQs", href: "#" },
            {
                id: "stay-private-sessions",
                label: "Private Sessions",
                href: "#",
            },
        ],
    },
    { id: "give", label: "Give", href: "#" },
    { id: "blog", label: "Blog", href: "/blog" },
    {
        id: "about",
        label: "About",
        href: "#",
        children: [
            { id: "about-who-we-are", label: "Who We Are", href: "#" },
            {
                id: "about-trust-vision",
                label: "Anahata Trust & Vision",
                href: "#",
            },
            {
                id: "about-meaning",
                label: "The Meaning of the Word 'Anahata'",
                href: "#",
            },
            {
                id: "about-yoga",
                label: "Yoga",
                href: "#",
                children: [
                    { id: "yoga-hatha", label: "Hatha Yoga", href: "#" },
                    { id: "yoga-karma", label: "Karma Yoga", href: "#" },
                    { id: "yoga-bhakti", label: "Bhakti Yoga", href: "#" },
                    { id: "yoga-mantra", label: "Mantra Yoga", href: "#" },
                    { id: "yoga-jnana", label: "Jnana Yoga", href: "#" },
                    { id: "yoga-raja", label: "Raja Yoga", href: "#" },
                ],
            },
            { id: "about-eco-living", label: "Eco Living", href: "#" },
            {
                id: "about-ashram-principles",
                label: "Ashram Principles",
                href: "#",
            },
            { id: "about-tour", label: "Tour of Anahata", href: "#" },
            { id: "about-gallery", label: "Gallery", href: "#" },
            {
                id: "about-guests",
                label: "What Our Guests Are Saying",
                href: "#",
            },
        ],
    },
    { id: "contact", label: "Contact", href: "#" },
    { id: "newsletter", label: "Our Newsletter", href: "#" },
    {
        id: "shop",
        label: "Shop",
        href: "/products",
        children: [
            // Self-routes both personas: signed out -> the OTP sign-in form;
            // signed in -> /dashboard, which CourseLit renders differently
            // for an admin vs. an enrolled student. One link, either role.
            { id: "shop-account", label: "My account", href: "/login" },
            { id: "shop-all", label: "All Products", href: "/products" },
            { id: "shop-books", label: "Books", href: "#" },
            { id: "shop-audio", label: "Audio", href: "#" },
            { id: "shop-other", label: "Other Products", href: "#" },
        ],
    },
];
