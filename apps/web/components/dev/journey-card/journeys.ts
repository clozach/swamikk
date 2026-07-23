/* ------------------------------------------------------------------ *
 * Journey Card registry — the four-journey demo walkthrough as data.
 *
 * THIS IS THE FILE FUTURE MODEL SESSIONS EDIT. If a change adds or alters
 * anything a tester exercises through the UI, finish by adding/updating the
 * journey that walks it (see the fork AGENTS.md § Journey Cards).
 *
 * ID contract (frozen — a future issue-reporter keys on it):
 *   - Journey `id` is a stable slug; step `id` is stable kebab-case, unique
 *     WITHIN its journey. The (journeyId, stepId) PAIR is the global key.
 *   - Never rename or reuse an existing id. Append new steps. A deleted step's
 *     id retires forever — stale saved state falls back to the journey start
 *     via the hydration guard in index.tsx.
 *
 * Step text is a list of segments, never an HTML string — no
 * dangerouslySetInnerHTML. `code` segments render as chips.
 *
 * `auto` describes "do it for me" (executed by automation.ts, Phase 3):
 *   navigate → go to href (advances step first, so the card resumes there).
 *   click    → click the visible element matching selector.
 *   fill     → set a controlled input via the native setter, optionally submit.
 *   copy     → clipboard assist (e.g. the Stripe test card).
 *   manual   → not automatable; renders hands-on, never looks clickable.
 *
 * data-journey tokens the fill/click selectors below rely on (added to the
 * fixed controls in Phase 3; keep this list in sync when you add a selector):
 *   checkout-email · checkout-continue · complete-purchase
 *   · newsletter-email · newsletter-subscribe
 * (buy-now / enrol-now target the page's sole `a[href^="/checkout"]` CTA
 * instead — those CTAs are CMS page-block content, not fixed components.)
 * ------------------------------------------------------------------ */

/** A run of step text. `code` segments render as monospace chips. */
export type Seg =
    | { kind: "text"; text: string }
    | { kind: "code"; text: string };

/** What "do it for me" does when the focused step's label is clicked. */
export type StepAuto =
    | { kind: "navigate"; href: string }
    | { kind: "click"; selector: string }
    | {
          kind: "fill";
          selector: string;
          value: string;
          thenClickSelector?: string;
      }
    | { kind: "copy"; text: string; note?: string }
    | { kind: "manual"; why: string };

export interface JourneyStep {
    /** stable kebab-case, unique within its journey — see id contract above. */
    id: string;
    label: Seg[];
    auto: StepAuto;
}

export interface Journey {
    /** stable slug. */
    id: string;
    /** spine label. */
    name: string;
    steps: JourneyStep[];
}

/* Convenience builders keep the data below readable without loosening types. */
const t = (text: string): Seg => ({ kind: "text", text });
const c = (text: string): Seg => ({ kind: "code", text });

const TEST_CARD = "4242 4242 4242 4242";

export const JOURNEYS: Journey[] = [
    {
        id: "jake",
        name: "Jake",
        steps: [
            {
                id: "open-shop",
                label: [c("Shop → All Products")],
                auto: { kind: "navigate", href: "/products" },
            },
            {
                id: "open-mp3",
                label: [t("Open the "), c("$9 MP3")],
                auto: {
                    kind: "navigate",
                    href: "/p/natural-breath-awareness-guided-practice-mp-3",
                },
            },
            {
                id: "buy-now",
                label: [c("Buy now")],
                // The product-landing CTA is CMS page-block content, not a
                // fixed component — but it is the only /checkout link on the
                // page, so target it by href rather than a data-journey tag.
                auto: { kind: "click", selector: 'a[href^="/checkout"]' },
            },
            {
                id: "email-continue",
                label: [t("Email → "), c("Continue")],
                auto: {
                    kind: "fill",
                    selector: '[data-journey="checkout-email"]',
                    value: "jake@example.com",
                    thenClickSelector: '[data-journey="checkout-continue"]',
                },
            },
            {
                id: "verify-otp",
                label: [t("Code → "), c("Verify OTP")],
                auto: {
                    kind: "manual",
                    why: "The one-time code lands in a real inbox — on the rig, read it in Mailpit at http://localhost:8025.",
                },
            },
            {
                id: "complete-purchase",
                label: [c("Complete Purchase")],
                auto: {
                    kind: "click",
                    selector: '[data-journey="complete-purchase"]',
                },
            },
            {
                id: "test-card",
                label: [t("Card "), c(TEST_CARD)],
                auto: {
                    kind: "copy",
                    text: TEST_CARD,
                    note: "any future date, any CVC",
                },
            },
            {
                id: "download",
                label: [c("Download")],
                auto: {
                    kind: "manual",
                    why: "After Stripe returns you to the site (/checkout/verify), the download appears here.",
                },
            },
        ],
    },
    {
        id: "april",
        name: "April",
        steps: [
            {
                id: "open-course",
                label: [t("Open "), c("Building Resilience")],
                auto: {
                    kind: "navigate",
                    href: "/p/2026-developing-resilience-online-course",
                },
            },
            {
                id: "enrol-now",
                label: [c("Enrol Now")],
                // CMS CTA — the only /checkout link on the editorial page.
                auto: { kind: "click", selector: 'a[href^="/checkout"]' },
            },
            {
                id: "email-continue",
                label: [t("Email → "), c("Continue")],
                auto: {
                    kind: "fill",
                    selector: '[data-journey="checkout-email"]',
                    value: "april@example.com",
                    thenClickSelector: '[data-journey="checkout-continue"]',
                },
            },
            {
                id: "verify-otp",
                label: [t("Code → "), c("Verify OTP")],
                auto: {
                    kind: "manual",
                    why: "Same email one-time code Jake met — read it in the inbox (Mailpit on the rig).",
                },
            },
            {
                id: "complete-purchase",
                label: [c("Complete Purchase")],
                auto: {
                    kind: "click",
                    selector: '[data-journey="complete-purchase"]',
                },
            },
            {
                id: "test-card",
                label: [t("Card "), c(TEST_CARD)],
                auto: {
                    kind: "copy",
                    text: TEST_CARD,
                    note: "any future date, any CVC",
                },
            },
            {
                id: "open-the-course",
                label: [t("Open the course")],
                auto: {
                    kind: "manual",
                    why: "After the /checkout/verify return leg, April's enrolled — her lessons live in the member area.",
                },
            },
        ],
    },
    {
        id: "elana",
        name: "Elana",
        steps: [
            {
                id: "stay-in-touch",
                label: [t("Home → "), c("Stay in Touch")],
                auto: { kind: "navigate", href: "/" },
            },
            {
                id: "subscribe",
                label: [t("Email → "), c("Subscribe")],
                auto: {
                    kind: "fill",
                    selector: '[data-journey="newsletter-email"]',
                    value: "elana@example.com",
                    thenClickSelector: '[data-journey="newsletter-subscribe"]',
                },
            },
            {
                id: "subscribed",
                label: [t("See “you’re subscribed”")],
                auto: {
                    kind: "manual",
                    why: "The confirmation appears inline, right where the form was.",
                },
            },
            {
                id: "unsubscribe",
                label: [t("Email footer → "), c("Unsubscribe")],
                auto: {
                    kind: "manual",
                    why: "The unsubscribe link carries a secret per-user token in the newsletter footer — it can't be synthesised.",
                },
            },
            {
                id: "confirmed",
                label: [t("Confirmed page")],
                auto: {
                    kind: "manual",
                    why: "The unsubscribe-confirmed page; the list quietly records the exit.",
                },
            },
        ],
    },
    {
        id: "karuna",
        name: "Karuna",
        steps: [
            {
                id: "login",
                label: [c("/login"), t(" → "), c("Get code")],
                auto: { kind: "navigate", href: "/login" },
            },
            {
                // Corrected per journey-card-dev-plan §3.6: /dashboard/media is
                // the read-only library; uploads happen in the media-selector
                // dialog reached from editing a product's featured image.
                id: "upload",
                label: [
                    c("Products"),
                    t(" → edit → featured image → "),
                    c("Upload"),
                ],
                auto: {
                    kind: "manual",
                    why: "The native file picker is the Safari upload test — it can't (and shouldn't) be automated. Reach it from Products → edit a product → featured image → Upload.",
                },
            },
            {
                id: "coupon",
                label: [c("Settings → Payment"), t(" → new "), c("coupon")],
                auto: {
                    kind: "navigate",
                    href: "/dashboard/settings",
                },
            },
            {
                id: "subscribers",
                label: [c("Subscribers"), t(" → Elana")],
                auto: {
                    kind: "navigate",
                    href: "/dashboard/subscribers",
                },
            },
        ],
    },
];
