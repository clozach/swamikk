import React, { useCallback, useEffect, useRef, useState } from "react";
import { WidgetProps } from "@courselit/common-models";
import clsx from "clsx";
import Settings from "../settings";
import {
    accountLoginLabel as defaultAccountLoginLabel,
    homeHref as defaultHomeHref,
    logoAlt as defaultLogoAlt,
    logoHeight as defaultLogoHeight,
    logoSrc as defaultLogoSrc,
    logoWidth as defaultLogoWidth,
    menu as defaultMenu,
    mobileCloseLabel as defaultMobileCloseLabel,
    mobileCtaHref as defaultMobileCtaHref,
    mobileCtaLabel as defaultMobileCtaLabel,
    mobileMenuLabel as defaultMobileMenuLabel,
    showTopBar as defaultShowTopBar,
    sticky as defaultSticky,
    themeToggleLabel as defaultThemeToggleLabel,
    showThemeToggle as defaultShowThemeToggle,
    topBarLeftItems as defaultTopBarLeftItems,
    topBarRightItems as defaultTopBarRightItems,
} from "../defaults";
import {
    CREAM,
    RUST,
    RUST_PRESSED,
    AMBER,
    INK,
    SAFFRON,
    DARK_BG,
    DARK_PANEL,
    HEADER_CONTAINER,
    FONT_BODY,
    STICKY_HEADER_BAND_BASE,
    STICKY_HEADER_BAND_FIXED,
    STICKY_HEADER_BAND_STUCK,
    NAV_THEME_TOGGLE,
} from "./tokens";
import DesktopNavItem from "./desktop-nav";
import TopBar from "./top-bar";
import MobileOverlay, { MobileMenuState } from "./mobile-overlay";
import ThemeToggle from "./theme-toggle";
import AccountControl from "./account-control";

/* ------------------------------------------------------------------ *
 * Detects whether the header band should be pinned ("stuck") to the top
 * of the viewport. This drives BOTH the drop-shadow the live site adds
 * once scrolled (#site-header-sticky-wrapper.is-sticky .has-sticky-
 * dropshadow) AND the band's actual positioning mode — see the long
 * comment on STICKY_HEADER_BAND_FIXED in ./tokens for why plain CSS
 * `position: sticky` cannot pin this band on its own (its containing
 * block, <header>, is too short to hold a stuck state for any real
 * scroll distance) and `fixed` + a flow spacer is used instead.
 *
 * A 1px sentinel sits in normal flow immediately above the band, right
 * where the band's own un-pinned top would be. Once the page scrolls far
 * enough that the band's native position would cross the viewport's top
 * edge, the sentinel crosses it first (it precedes the band in flow), and
 * the band switches to fixed at exactly that instant.
 *
 * The crossing is detected by reading the sentinel's own position on a
 * passive, rAF-throttled scroll listener rather than with an
 * IntersectionObserver. IO is the more usual tool here and was tried
 * first, but it made the whole feature depend on a callback that some
 * embedded/automated browsers never deliver — observed firsthand: in one
 * such runtime `IntersectionObserver` was present and constructible yet
 * never invoked its callback even once, for any element, so the header
 * simply never pinned and nothing in the DOM hinted at why. A scroll
 * listener has no such failure mode, and one getBoundingClientRect per
 * animation frame is not a cost worth optimising away for a header.
 * ------------------------------------------------------------------ */
function useStuck(enabled: boolean) {
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const [stuck, setStuck] = useState(false);

    useEffect(() => {
        if (!enabled || typeof window === "undefined") {
            setStuck(false);
            return;
        }
        const sentinel = sentinelRef.current;
        if (!sentinel) {
            return;
        }

        // Read straight through, with no requestAnimationFrame coalescing in
        // between. The usual reason to rAF-throttle a scroll handler is to
        // avoid doing layout work more than once a frame, but browsers already
        // deliver scroll at most once per frame to the main thread, so a single
        // getBoundingClientRect here buys nothing measurable — while the rAF
        // hop adds a real failure mode: anywhere frame callbacks are suspended,
        // the header silently stops pinning. Any backgrounded document does
        // exactly that (verified: in a headless pane reporting
        // document.hidden === true, rAF, IntersectionObserver and scroll
        // callbacks were all suspended together, which is what made this
        // behaviour untestable in the first place).
        const measure = () => {
            // Strictly less than zero, not <=. With the utility bar hidden the
            // band's natural position IS the top of the page, so the sentinel
            // rests at exactly 0 — and <= would latch the header pinned from
            // first paint, before it had ever scrolled. That also poisoned the
            // spacer: the band's height would be measured while already fixed
            // rather than in flow, leaving the spacer short and the page
            // content jumping.
            setStuck(sentinel.getBoundingClientRect().top < 0);
        };

        measure(); // deep-linked/restored scroll positions start pinned
        window.addEventListener("scroll", measure, { passive: true });
        window.addEventListener("resize", measure, { passive: true });
        return () => {
            window.removeEventListener("scroll", measure);
            window.removeEventListener("resize", measure);
        };
    }, [enabled]);

    return { sentinelRef, stuck: enabled && stuck };
}

/* ------------------------------------------------------------------ *
 * Measures the band's own natural (in-flow) height, so that once it
 * switches to `position: fixed` — removing it from flow — a spacer of
 * the same height can hold its old place and the page content below it
 * doesn't jump. A ResizeObserver (not a one-shot measurement) keeps this
 * correct across breakpoint changes, nav wrapping, and web-font reflow,
 * matching the pattern already used for the flyout clamp in
 * ./desktop-nav.tsx.
 * ------------------------------------------------------------------ */
function useMeasuredHeight(enabled: boolean) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [height, setHeight] = useState(0);

    useEffect(() => {
        if (!enabled || typeof window === "undefined") {
            return;
        }
        const el = ref.current;
        if (!el) {
            return;
        }
        const measure = () => {
            // Only ever record the band's IN-FLOW height. Once it is pinned it
            // is out of flow, and whatever it measures then says nothing about
            // the gap the spacer has to fill.
            if (getComputedStyle(el).position === "fixed") {
                return;
            }
            setHeight(el.offsetHeight);
        };
        measure();

        // The mount-time reading is taken before the logo image and the web
        // fonts have settled, and it is wrong by their contribution — measured
        // at 87px against a settled 151px, so the spacer would have been 64px
        // short and the page would have jumped by that much on first pin.
        // ResizeObserver would ordinarily correct it, but a backgrounded
        // document suspends those callbacks, so this cannot rely on it alone:
        // `load` fires once images and fonts are in, and scroll/resize cover
        // any later reflow. The observer stays as the fast path where it runs.
        const observer =
            typeof ResizeObserver === "undefined"
                ? undefined
                : new ResizeObserver(measure);
        observer?.observe(el);
        window.addEventListener("load", measure);
        window.addEventListener("resize", measure);
        window.addEventListener("scroll", measure, { passive: true });
        return () => {
            observer?.disconnect();
            window.removeEventListener("load", measure);
            window.removeEventListener("resize", measure);
            window.removeEventListener("scroll", measure);
        };
    }, [enabled]);

    return { ref, height };
}

/* ------------------------------------------------------------------ *
 * The block
 * ------------------------------------------------------------------ */
export default function Widget({
    settings,
    editing,
    nextTheme,
    toggleTheme,
    state,
}: WidgetProps<Settings>): JSX.Element {
    const isDarkTheme = nextTheme === "dark";
    // The page already resolves the signed-in member into `state.profile`
    // (and gates the paint on it, so there is no logged-out flash). The
    // account control reads it directly — no auth client inside the block.
    const profile = state?.profile;
    const accountLoginLabel =
        settings.accountLoginLabel || defaultAccountLoginLabel;
    const [mobileMenu, setMobileMenu] = useState<MobileMenuState>({
        kind: "closed",
    });

    // `??`, not a truthiness check on `.length`: an admin who deletes every
    // nav item must get an empty nav, not the Anahata tree resurrected.
    // A never-configured widget still arrives as `settings: {}` and defaults.
    const menu = settings.menu ?? defaultMenu;
    const topBarLeftItems = settings.topBarLeftItems ?? defaultTopBarLeftItems;
    const topBarRightItems =
        settings.topBarRightItems ?? defaultTopBarRightItems;
    const showTopBar = settings.showTopBar ?? defaultShowTopBar;
    const sticky = settings.sticky ?? defaultSticky;
    const showThemeToggle = settings.showThemeToggle ?? defaultShowThemeToggle;
    const themeToggleLabel =
        settings.themeToggleLabel || defaultThemeToggleLabel;
    // Never lets the band actually go `fixed` inside the page builder: the
    // editing overlay in editable-widget.tsx is an `absolute inset-0` sized
    // to this widget's own (non-sticky) wrapper box, so it only ever covers
    // the band's in-flow position. A `fixed` band visually escapes that box
    // once the page scrolls, which would leave a click meant for "open the
    // edit panel" falling through to the band's own live links/flyouts
    // instead. Keeping the band in normal flow while editing keeps the
    // click-catch overlay valid; the true `sticky` setting still governs
    // the published page.
    const stickyEnabled = sticky && !editing;
    const { sentinelRef, stuck } = useStuck(stickyEnabled);
    // Measured whenever sticky is enabled (not just once stuck): the height
    // has to be known *before* the first stuck transition, or the very
    // first spacer render would use the stale initial 0 and the page would
    // jump.
    const { ref: bandRef, height: bandHeight } =
        useMeasuredHeight(stickyEnabled);
    const logoFile =
        settings.logoMedia?.file || settings.logoSrc || defaultLogoSrc;
    const logoAlt = settings.logoAlt || defaultLogoAlt;
    const logoWidth = settings.logoWidth || defaultLogoWidth;
    const logoHeight = settings.logoHeight || defaultLogoHeight;
    const homeHref = settings.homeHref || defaultHomeHref;
    const mobileMenuLabel = settings.mobileMenuLabel || defaultMobileMenuLabel;
    const mobileCtaLabel = settings.mobileCtaLabel || defaultMobileCtaLabel;
    const mobileCtaHref = settings.mobileCtaHref || defaultMobileCtaHref;
    const mobileCloseLabel =
        settings.mobileCloseLabel || defaultMobileCloseLabel;

    const closeMobileMenu = useCallback(
        () => setMobileMenu({ kind: "closed" }),
        [],
    );

    return (
        <header
            id={settings.cssId}
            className="relative w-full"
            style={{ fontFamily: FONT_BODY }}
        >
            {showTopBar && (
                <TopBar left={topBarLeftItems} right={topBarRightItems} />
            )}
            {/* Marks where the band's own natural flow position sits, so
                `useStuck` can tell when the band should pin — see the hook
                above. Not rendered when sticky is off (or while editing —
                see `stickyEnabled`), since nothing then transitions to a
                pinned state. */}
            {stickyEnabled && (
                <div ref={sentinelRef} aria-hidden="true" className="h-px" />
            )}
            {/* Holds the band's old flow slot the instant it switches to
                `fixed` (see STICKY_HEADER_BAND_FIXED in ./tokens for why
                `position: sticky` alone can't pin it) — without this the
                page content directly below would jump up by the band's
                full height the moment it's removed from flow. */}
            {stickyEnabled && stuck && (
                <div aria-hidden="true" style={{ height: bandHeight }} />
            )}
            <div
                ref={bandRef}
                className={clsx(
                    "border-b border-t-[6px] border-solid",
                    stickyEnabled &&
                        (stuck
                            ? STICKY_HEADER_BAND_FIXED
                            : STICKY_HEADER_BAND_BASE),
                    stickyEnabled && stuck && STICKY_HEADER_BAND_STUCK,
                )}
                style={
                    {
                        backgroundColor: isDarkTheme ? DARK_BG : CREAM,
                        // Rust measures 2.49:1 on DARK_BG — under the 3:1
                        // non-text floor — so the 6px top border promotes to
                        // saffron in dark mode instead of staying rust.
                        borderTopColor: isDarkTheme ? SAFFRON : RUST,
                        borderBottomColor: AMBER,
                        // Set once here and inherited by every descendant —
                        // nav links, the flyouts, the theme toggle — so none
                        // of them need nextTheme threaded through their own
                        // props. See the contrast table in ./tokens.
                        "--nav-fg": isDarkTheme ? CREAM : INK,
                        "--nav-fg-hover": isDarkTheme ? SAFFRON : RUST,
                        "--nav-fg-active": isDarkTheme ? AMBER : RUST_PRESSED,
                        "--nav-panel-bg": isDarkTheme ? DARK_PANEL : "#ffffff",
                        "--nav-panel-border": isDarkTheme ? SAFFRON : RUST,
                    } as React.CSSProperties
                }
            >
                <div
                    className={clsx(
                        HEADER_CONTAINER,
                        // One row, one masthead: the mark sits immediately left
                        // of the first nav item rather than as a free-standing
                        // wordmark centred on its own line above the menu. The
                        // whole row is centred as a unit — logo and nav read as
                        // one object rather than a chip stacked over a menu.
                        "flex items-center justify-center gap-x-[18px] py-[14px]",
                    )}
                >
                    <a
                        href={homeHref}
                        aria-label={logoAlt}
                        className="block shrink-0 rounded-[6px] no-underline"
                    >
                        <img
                            src={logoFile}
                            alt=""
                            width={logoWidth}
                            height={logoHeight}
                            className="block rounded-[6px]"
                            style={{
                                width: `${logoWidth}px`,
                                height: `${logoHeight}px`,
                            }}
                        />
                    </a>

                    {/* Grows to fill the space between the left-anchored logo
                        and the right-anchored account zone, so its own
                        justify-center leaves the menu optically centred while
                        the account control sits at the true top-right corner.
                        `flex-1` is desktop-only; on mobile the nav is hidden and
                        the lone logo re-centres under the masthead's own
                        justify-center — and if `flex-1` ever lost the cascade,
                        the row degrades to a centred logo+nav+account cluster
                        rather than breaking. */}
                    <nav
                        aria-label="Main"
                        className="max-[767px]:hidden min-[768px]:flex-1"
                    >
                        <ul className="m-0 flex list-none flex-wrap items-center justify-center p-0">
                            {menu.map((item) => (
                                <DesktopNavItem key={item.id} item={item} />
                            ))}
                            {showThemeToggle && (
                                <li className="m-0 list-none p-0">
                                    <ThemeToggle
                                        nextTheme={nextTheme}
                                        toggleTheme={toggleTheme}
                                        label={themeToggleLabel}
                                        className={NAV_THEME_TOGGLE}
                                    />
                                </li>
                            )}
                        </ul>
                    </nav>

                    {/* Account presence, top-right. Desktop only — the phone
                        gets its account control inside the drawer (see
                        MobileOverlay). Two mutually-exclusive media-scoped
                        rules (`max-[767px]:hidden` / `min-[768px]:flex`) with
                        no base display class to lose to, the same idiom the
                        mobile bar below uses, since a base `flex` overridden by
                        a responsive `hidden` is a cascade coin-flip here. */}
                    <div className="max-[767px]:hidden min-[768px]:flex shrink-0 items-center">
                        <AccountControl
                            profile={profile}
                            editing={editing}
                            loginLabel={accountLoginLabel}
                            recaptchaConfigured={Boolean(
                                state?.config?.recaptchaSiteKey,
                            )}
                        />
                    </div>
                </div>

                {/* Mobile bar: inside the header band, below the masthead row. */}
                <div
                    className={clsx(
                        HEADER_CONTAINER,
                        // Two mutually-exclusive media-scoped rules rather than
                        // a base "flex" overridden by "md:hidden". The override
                        // does currently win, but only by luck: four stylesheets
                        // load in sequence (page-blocks, components-library,
                        // page-primitives, then apps/web's own Tailwind output),
                        // every one of them emits an unconditional `.flex`, and
                        // the only reason `.md\:hidden` lands last is that
                        // apps/web happens to use that utility too. Drop that
                        // coincidence and the bar stops hiding — which is exactly
                        // what befell the utility bar's `min-[560px]:block`, a
                        // class no later sheet emitted. Scoping both rules to
                        // their own range removes the dependency entirely.
                        "max-[767px]:flex min-h-[50px] items-center justify-between gap-4 text-[15px] md:hidden",
                    )}
                >
                    <button
                        type="button"
                        aria-expanded={mobileMenu.kind === "open"}
                        aria-haspopup="dialog"
                        onClick={() => {
                            if (!editing) {
                                setMobileMenu({ kind: "open" });
                            }
                        }}
                        className="flex items-center gap-[10px] uppercase text-[#545454] transition-colors duration-100 ease-in hover:text-[#993300] focus-visible:text-[#993300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]"
                    >
                        <svg
                            aria-hidden="true"
                            width="18"
                            height="14"
                            viewBox="0 0 18 14"
                        >
                            <path
                                d="M0 1h18M0 7h18M0 13h18"
                                stroke="currentColor"
                                strokeWidth="2"
                            />
                        </svg>
                        {mobileMenuLabel}
                    </button>
                    <a
                        href={mobileCtaHref || "#"}
                        className="inline-block whitespace-nowrap rounded-[4px] border border-solid border-[#993300] px-[25px] uppercase leading-[2em] text-[#545454] no-underline transition-colors duration-100 ease-in hover:bg-[#993300]/10 hover:text-[#993300] focus-visible:text-[#993300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300] max-[479px]:px-[15px]"
                    >
                        {mobileCtaLabel}
                    </a>
                </div>
            </div>

            <MobileOverlay
                state={mobileMenu}
                onClose={closeMobileMenu}
                menu={menu}
                // Same profile the desktop control reads, so the drawer opens
                // to the member's account (or a prominent sign-in) at the top.
                profile={profile}
                // The drawer is where the utility strip's items live on a
                // phone. Turning the strip off must remove them everywhere,
                // not just from the band the user can already see.
                utilityItems={
                    showTopBar ? [...topBarLeftItems, ...topBarRightItems] : []
                }
                closeLabel={mobileCloseLabel}
            />
        </header>
    );
}
