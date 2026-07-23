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
 *   - `done` and `handoff` are data ABOUT a step, not its identity — they may
 *     be edited freely later (e.g. upgrading a `none` to a real detector).
 *
 * Step text is a list of segments, never an HTML string — no
 * dangerouslySetInnerHTML. `code` segments render as chips.
 *
 * `auto` describes "do it for me" (executed by automation.ts):
 *   navigate → go to href (advances step first, so the card resumes there).
 *   click    → click the first VISIBLE element matching selector.
 *   fill     → set a controlled input via the native setter, optionally submit.
 *   copy     → clipboard assist (e.g. the Stripe test card).
 *   manual   → not automatable; renders hands-on, never looks clickable.
 *
 * `done` describes the guide-follows-you half (evaluated by detection.ts):
 * evidence that the step's OUTCOME is in effect. AUTHORING RULES:
 *   - Always the step's POST-state, never its pre-state; presence-only,
 *     never absence.
 *   - A `navigate` auto does NOT entitle a `path` detector — `path` is legal
 *     only when arrival IS the step's whole promise. (Violating this is how
 *     you get "created a coupon" auto-checked by merely visiting Settings —
 *     the textbook trust-killing false positive.)
 *   - A step with no reliable signal declares `{ kind: "none", why }` — it
 *     never auto-advances and it breaks detection chains. The `why` is the
 *     written audit for future sessions.
 *
 * data-journey tokens the selectors below rely on (each on a fork-owned
 * control; keep this inventory in sync):
 *   checkout-email · checkout-continue · checkout-otp · complete-purchase
 *   · newsletter-email · newsletter-subscribe · newsletter-subscribed
 *   · purchase-verified
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

/* --- where a detector is allowed to look ------------------------------- */
/** Out-of-scope is a non-event: the detector neither fires nor errors — the
 *  step simply waits. Trailing-slash-insensitive pathname comparison. */
export type DetectScope =
    | {
          at: "path-equals";
          path: string;
          /** Required query params, subset match, values exact — used ONLY to
           *  pin checkout product ids (see the pinned-id block below). */
          query?: Readonly<Record<string, string>>;
      }
    | { at: "path-prefix"; path: string };

/* --- evidence that the step's OUTCOME is in effect ---------------------- */
export type StepDone =
    /** Being at the place is the proof. */
    | { kind: "path"; scope: DetectScope }
    /** A visibly-present element proves it; evaluated only while `scope`
     *  matches. Selector goes through automation.ts's firstVisible (same
     *  offsetParent rule as "do it" — one source of truth). CSS comma
     *  selectors are the sanctioned anyOf; no detector trees. */
    | { kind: "dom"; scope: DetectScope; selector: string }
    /** No reliable signal. Never auto-advances; breaks chains. `why` is the
     *  written audit. */
    | { kind: "none"; why: string };

/* --- the off-site itinerary ---------------------------------------------
 * Route tokens carry the visual grammar in the type, not by position:
 *   away  = off the map (white chip, dashed border, trailing ↗),
 *   back  = the on-path resume point (marigold chip — solid ground),
 *   copy  = click-to-copy chip (reuses the copy executor + "Copied" note),
 *   plain = connective text.
 * Tokens are joined by → automatically. */
export type HandoffToken =
    | { kind: "away"; text: string }
    | { kind: "back"; text: string }
    | { kind: "copy"; text: string; note: string }
    | { kind: "plain"; text: string };

export interface Handoff {
    lead: "Round trip" | "Planned detour";
    route: HandoffToken[];
    /** Italic reassurance line. RENDER RULE (enforced in index.tsx, not by
     *  authors): shown only when this step's done.kind !== "none" — the card
     *  never promises a catch-up it cannot deliver. */
    reassure?: string;
    /** Note shown when DETECTION completes this step — the return greeting.
     *  Authored, not inferred. */
    returnNote?: string;
}

export interface JourneyStep {
    /** stable kebab-case, unique within its journey — see id contract above. */
    id: string;
    label: Seg[];
    auto: StepAuto;
    /** REQUIRED — "never audited" is unrepresentable. */
    done: StepDone;
    /** Only on steps whose action leaves the site. */
    handoff?: Handoff;
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

/* Pinned demo-DB ids. RESEED RITUAL: after any demo-DB reseed, open each
 * product page on the rig and copy the `id` query param from its
 * a[href^="/checkout"] CTA into these constants. A stale pin makes the
 * dependent detectors go FALSE-NEGATIVE (card stops following — visible in
 * one hands-only Jake walkthrough); it can never produce a false positive.
 * `type` is deliberately NOT pinned — `id` alone discriminates, and a wrong
 * `type` assumption would only add a failure mode. */
const JAKE_MP3_ID = "tqvZpF9bYqGurTRfvneXY";
const APRIL_COURSE_ID = "UdMMb-qi21roGPY16kBiP";

const JAKE_CHECKOUT: DetectScope = {
    at: "path-equals",
    path: "/checkout",
    query: { id: JAKE_MP3_ID },
};
const APRIL_CHECKOUT: DetectScope = {
    at: "path-equals",
    path: "/checkout",
    query: { id: APRIL_COURSE_ID },
};

/* Shared detector fragments. Arm 2 of LOGIN_EVIDENCE deliberately keys on
 * DOWNSTREAM evidence (an enabled Complete Purchase proves the login steps
 * are moot for an already-signed-in tester) — evidence-of-state, not gesture;
 * do not copy this pattern without the same argument. */
const OTP_OR_SIGNED_IN =
    '[data-journey="checkout-otp"], [data-journey="complete-purchase"]:not([disabled]):not([aria-disabled="true"])';
const SIGNED_IN =
    '[data-journey="complete-purchase"]:not([disabled]):not([aria-disabled="true"])';
const PURCHASE_VERIFIED = '[data-journey="purchase-verified"]';
const VERIFY_SCOPE: DetectScope = {
    at: "path-equals",
    path: "/checkout/verify",
};

const OTP_HANDOFF: Handoff = {
    lead: "Round trip",
    route: [
        { kind: "away", text: "your inbox" },
        { kind: "back", text: "back here" },
        { kind: "back", text: "Complete Purchase" },
    ],
    reassure: "This tab keeps your place — the code box will be waiting.",
};

const STRIPE_HANDOFF: Handoff = {
    lead: "Planned detour",
    route: [
        { kind: "away", text: "Stripe's card page" },
        { kind: "plain", text: "card" },
        { kind: "copy", text: TEST_CARD, note: "any future date, any CVC" },
        { kind: "back", text: "you land back at /checkout/verify" },
    ],
    reassure:
        "The card knows the way home — it'll be one step ahead when you land.",
    returnNote: "Welcome back — right on schedule.",
};

export const JOURNEYS: Journey[] = [
    {
        id: "jake",
        name: "Jake",
        steps: [
            {
                id: "open-shop",
                label: [c("Shop → All Products")],
                auto: { kind: "navigate", href: "/products" },
                // Being at the shop IS the step; exact match excludes /products/<x>.
                done: {
                    kind: "path",
                    scope: { at: "path-equals", path: "/products" },
                },
            },
            {
                id: "open-mp3",
                label: [t("Open the "), c("$9 MP3")],
                auto: {
                    kind: "navigate",
                    href: "/p/natural-breath-awareness-guided-practice-mp-3",
                },
                done: {
                    kind: "path",
                    scope: {
                        at: "path-equals",
                        path: "/p/natural-breath-awareness-guided-practice-mp-3",
                    },
                },
            },
            {
                id: "buy-now",
                label: [c("Buy now")],
                // The product-landing CTA is CMS page-block content, not a
                // fixed component — but it is the only /checkout link on the
                // page, so target it by href rather than a data-journey tag.
                auto: { kind: "click", selector: 'a[href^="/checkout"]' },
                // The id pin is load-bearing: without it April's checkout (or
                // any hand-typed checkout) satisfies Jake and the guide
                // narrates the wrong purchase.
                done: { kind: "path", scope: JAKE_CHECKOUT },
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
                done: {
                    kind: "dom",
                    scope: JAKE_CHECKOUT,
                    selector: OTP_OR_SIGNED_IN,
                },
            },
            {
                id: "verify-otp",
                label: [t("Code → "), c("Verify OTP")],
                auto: {
                    kind: "manual",
                    why: "The one-time code lands in a real inbox — on the rig, read it in Mailpit at http://localhost:8025.",
                },
                done: {
                    kind: "dom",
                    scope: JAKE_CHECKOUT,
                    selector: SIGNED_IN,
                },
                handoff: OTP_HANDOFF,
            },
            {
                id: "complete-purchase",
                label: [c("Complete Purchase")],
                auto: {
                    kind: "click",
                    selector: '[data-journey="complete-purchase"]',
                },
                // NEVER a URL detector: failed/pending render at the same
                // /checkout/verify URL and pending is the default first
                // render — only the paid-only stamp cannot lie.
                done: {
                    kind: "dom",
                    scope: VERIFY_SCOPE,
                    selector: PURCHASE_VERIFIED,
                },
                handoff: STRIPE_HANDOFF,
            },
            {
                id: "test-card",
                label: [t("Card "), c(TEST_CARD)],
                auto: {
                    kind: "copy",
                    text: TEST_CARD,
                    note: "any future date, any CVC",
                },
                // Same evidence as complete-purchase on purpose: the paid
                // stamp proves the card was entered and accepted; the two
                // chain in one sweep — the Stripe-return catch-up.
                done: {
                    kind: "dom",
                    scope: VERIFY_SCOPE,
                    selector: PURCHASE_VERIFIED,
                },
            },
            {
                id: "download",
                label: [c("Download")],
                auto: {
                    kind: "manual",
                    why: "After Stripe returns you to the site (/checkout/verify), the download appears here.",
                },
                done: {
                    kind: "none",
                    why: "terminal; a download click mutates nothing observable",
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
                done: {
                    kind: "path",
                    scope: {
                        at: "path-equals",
                        path: "/p/2026-developing-resilience-online-course",
                    },
                },
            },
            {
                id: "enrol-now",
                label: [c("Enrol Now")],
                // CMS CTA — the only /checkout link on the editorial page.
                auto: { kind: "click", selector: 'a[href^="/checkout"]' },
                done: { kind: "path", scope: APRIL_CHECKOUT },
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
                done: {
                    kind: "dom",
                    scope: APRIL_CHECKOUT,
                    selector: OTP_OR_SIGNED_IN,
                },
            },
            {
                id: "verify-otp",
                label: [t("Code → "), c("Verify OTP")],
                auto: {
                    kind: "manual",
                    why: "Same email one-time code Jake met — read it in the inbox (Mailpit on the rig).",
                },
                done: {
                    kind: "dom",
                    scope: APRIL_CHECKOUT,
                    selector: SIGNED_IN,
                },
                handoff: OTP_HANDOFF,
            },
            {
                id: "complete-purchase",
                label: [c("Complete Purchase")],
                auto: {
                    kind: "click",
                    selector: '[data-journey="complete-purchase"]',
                },
                done: {
                    kind: "dom",
                    scope: VERIFY_SCOPE,
                    selector: PURCHASE_VERIFIED,
                },
                handoff: STRIPE_HANDOFF,
            },
            {
                id: "test-card",
                label: [t("Card "), c(TEST_CARD)],
                auto: {
                    kind: "copy",
                    text: TEST_CARD,
                    note: "any future date, any CVC",
                },
                done: {
                    kind: "dom",
                    scope: VERIFY_SCOPE,
                    selector: PURCHASE_VERIFIED,
                },
            },
            {
                id: "open-the-course",
                label: [t("Open the course")],
                auto: {
                    kind: "manual",
                    why: "After the /checkout/verify return leg, April's enrolled — her lessons live in the member area.",
                },
                done: {
                    kind: "none",
                    why: "member-area route not pinned; upgrade to a path detector once verified on the rig — done is editable data, ids are frozen",
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
                // Exact match — a prefix "/" would match the whole site.
                done: {
                    kind: "path",
                    scope: { at: "path-equals", path: "/" },
                },
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
                // The attr exists only in the `subscribed` arm of the widget's
                // own tagged union — invalid/error/submitting render the same
                // <p> without it; the page-builder fake-success lives under
                // /dashboard, excluded by scope.
                done: {
                    kind: "dom",
                    scope: { at: "path-equals", path: "/" },
                    selector: '[data-journey="newsletter-subscribed"]',
                },
            },
            {
                id: "subscribed",
                label: [t("See “you’re subscribed”")],
                auto: {
                    kind: "manual",
                    why: "The confirmation appears inline, right where the form was.",
                },
                done: {
                    kind: "none",
                    why: "witness step: 'confirmation seen' is a human beat; the chain from subscribe stops here on purpose so the tester reads it",
                },
            },
            {
                id: "unsubscribe",
                label: [t("Email footer → "), c("Unsubscribe")],
                auto: {
                    kind: "manual",
                    why: "The unsubscribe link carries a secret per-user token in the newsletter footer — it can't be synthesised.",
                },
                done: {
                    kind: "none",
                    why: "confirmed-page route unverified on the rig; upgrade to path-equals <route> once verified — the secret per-user token makes it effectively unforgeable",
                },
                handoff: {
                    lead: "Round trip",
                    route: [
                        {
                            kind: "away",
                            text: "the newsletter footer in your inbox",
                        },
                        { kind: "plain", text: "Unsubscribe" },
                        { kind: "back", text: "the confirmed page" },
                    ],
                    // no reassure: detector is `none`; the card must not
                    // promise to follow.
                },
            },
            {
                id: "confirmed",
                label: [t("Confirmed page")],
                auto: {
                    kind: "manual",
                    why: "The unsubscribe-confirmed page; the list quietly records the exit.",
                },
                done: { kind: "none", why: "terminal witness" },
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
                // Server auth-gates /dashboard/*; presence proves
                // authenticated-into-admin. (Arrival at /login itself proves
                // nothing — that would be a pre-state detector.)
                done: {
                    kind: "path",
                    scope: { at: "path-prefix", path: "/dashboard" },
                },
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
                done: {
                    kind: "none",
                    why: "native file picker + stock media dialog; no fork-owned success marker; any guessed selector fires on pre-existing media",
                },
            },
            {
                id: "coupon",
                label: [c("Settings → Payment"), t(" → new "), c("coupon")],
                auto: {
                    kind: "navigate",
                    href: "/dashboard/settings",
                },
                done: {
                    kind: "none",
                    why: "arrival at Settings ≠ coupon created; only success signal is a transient stock toast. A path detector would self-satisfy the moment 'do it' navigates — the textbook trust-killing false positive",
                },
            },
            {
                id: "subscribers",
                label: [c("Subscribers"), t(" → Elana")],
                auto: {
                    kind: "navigate",
                    href: "/dashboard/subscribers",
                },
                done: {
                    kind: "none",
                    why: "terminal; arriving at the list ≠ found Elana",
                },
            },
        ],
    },
];
