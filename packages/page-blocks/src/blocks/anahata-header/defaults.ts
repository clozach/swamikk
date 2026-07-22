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

/* ------------------------------------------------------------------ *
 * Account presence — the always-available sign-in / account control.
 *
 * Sign-in is a single OTP flow, so "Log in" and "Create account" are the
 * same action → /login (the fuller mobile label spells that out where the
 * drawer has room). The signed-in destinations are fixed CourseLit routes:
 * /dashboard/profile edits the account; /dashboard self-routes by role
 * (admin → overview, student → my-content); /logout runs the sign-out. All
 * are plain hrefs — the block needs no auth client, only the profile the
 * page already hands it in `state`.
 * ------------------------------------------------------------------ */
export const accountLoginLabel = "Log in";
export const accountLoginHref = "/login";
export const accountLoginMobileLabel = "Log in / Create account";
export const accountLoginMobileHint = "One tap — we email you a sign-in code.";

/* Copy for the inline login popover (the OTP form anchored to the pill). */
export const accountLoginPanelHeading = "Sign in or create an account";
export const accountLoginCodeHeadingPrefix = "Enter the code sent to";
export const accountLoginGetCodeLabel = "Get code";
export const accountLoginContinueLabel = "Continue";
export const accountLoginResendLabel = "Resend";
export const accountLoginResendPrompt = "Didn't get it?";
export const accountManageLabel = "Manage account";
export const accountManageHref = "/dashboard/profile";
export const accountContentLabel = "My content";
export const accountContentHref = "/dashboard";
/* "Logout" (one word) to match the Figma confirm-animation frames. Logging
   out is a two-click action in place: the control arms, a rust panel wipes in
   left→right, the icon flies off and a "?" takes its place; a second click
   confirms. No navigation to the whole-page /logout confirmation. */
export const accountLogoutLabel = "Logout";

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
    /* Menu pivot (2026-07-21): STAY removed entirely, and ABOUT (with its
       Yoga subtree) removed. The FAQ item that briefly lived here (it toggled
       the demo-walkthrough tracker) is gone too — that tool became the
       keyboard-summoned Journey Card, mounted site-wide outside this block
       (apps/web/components/dev/journey-card). Events / Give / Contact / Our
       Newsletter stay as styled placeholders. */
    { id: "give", label: "Give", href: "#" },
    { id: "blog", label: "Blog", href: "/blog" },
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
