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

export const logoSrc = "/anahata/logo-2021.png";
export const logoAlt = "Anahata Yoga Retreat";
export const logoWidth = 250;
export const logoHeight = 64;
export const homeHref = "/";

export const showTopBar = true;

export const topBarLeftItems: TopBarItem[] = [
    { id: "topbar-cart", label: "Cart / 0 Items", href: "#" },
    { id: "topbar-search", label: "Search", href: "#" },
];

export const topBarRightItems: TopBarItem[] = [
    { id: "topbar-menu", label: "Menu", href: "#" },
    { id: "topbar-contact", label: "Contact", href: "#" },
];

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
