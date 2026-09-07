import { MenuItem, TopBarItem } from "./settings";

/**
 * Defaults are the real Anahata Yoga Retreat header, verbatim.
 * IDs are stable literals (never generated) so server and client render the
 * same markup and so re-saving in the page builder does not churn keys.
 *
 * Membership, help and newsletter remain native. Retreat destinations are
 * verified Anahata pages and carry an external-site cue.
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
export const mobileCtaHref = "/p/contact";
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
    { id: "membership", label: "Membership", href: "/p/members-library-test" },
    {
        id: "events",
        label: "Anahata events ↗",
        href: "https://www.anahata-retreat.org.nz/gatherings",
        children: [
            {
                id: "events-upcoming",
                label: "Upcoming Events ↗",
                href: "https://www.anahata-retreat.org.nz/upcoming-events",
            },
            {
                id: "events-past",
                label: "Past Events ↗",
                href: "https://www.anahata-retreat.org.nz/gatherings/past-gatherings",
            },
            {
                id: "events-venue",
                label: "Venue Hire ↗",
                href: "https://www.anahata-retreat.org.nz/venue-hire",
            },
        ],
    },
    {
        id: "give",
        label: "Give at Anahata ↗",
        href: "https://www.anahata-retreat.org.nz/give",
    },
    { id: "blog", label: "Blog", href: "/blog" },
    { id: "contact", label: "Contact", href: "/p/contact" },
    { id: "newsletter", label: "Newsletter", href: "/#stay-in-touch" },
    {
        id: "shop",
        label: "Shop",
        href: "/products",
        children: [
            { id: "shop-account", label: "My account", href: "/login" },
            { id: "shop-all", label: "All Products", href: "/products" },
        ],
    },
];
