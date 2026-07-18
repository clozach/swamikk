import React, { useCallback, useState } from "react";
import { WidgetProps } from "@courselit/common-models";
import clsx from "clsx";
import Settings from "../settings";
import {
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
    topBarLeftItems as defaultTopBarLeftItems,
    topBarRightItems as defaultTopBarRightItems,
} from "../defaults";
import { CREAM, RUST, AMBER, HEADER_CONTAINER, FONT_BODY } from "./tokens";
import DesktopNavItem from "./desktop-nav";
import TopBar from "./top-bar";
import MobileOverlay, { MobileMenuState } from "./mobile-overlay";

/* ------------------------------------------------------------------ *
 * The block
 * ------------------------------------------------------------------ */
export default function Widget({
    settings,
    editing,
}: WidgetProps<Settings>): JSX.Element {
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
            <div
                className="border-b border-t-[6px] border-solid"
                style={{
                    backgroundColor: CREAM,
                    borderTopColor: RUST,
                    borderBottomColor: AMBER,
                }}
            >
                <div
                    className={clsx(
                        HEADER_CONTAINER,
                        // Stacked and centred below 1140px, side by side above
                        // — the live site reflows well before the mobile menu.
                        "flex flex-col items-center min-[1140px]:flex-row min-[1140px]:justify-between",
                    )}
                >
                    <div className="pb-[16px] pt-[14px]">
                        <a href={homeHref} className="block no-underline">
                            {/* Plain <img>: the shared Image primitive forces a
                                16:9 fill box, which would crop a 250x64
                                wordmark. Same-origin /public path. */}
                            <img
                                src={logoFile}
                                alt={logoAlt}
                                width={logoWidth}
                                height={logoHeight}
                                className="block h-auto w-auto max-w-full"
                                style={{ maxHeight: `${logoHeight}px` }}
                            />
                        </a>
                    </div>

                    <nav
                        aria-label="Main"
                        className="hidden md:block min-[1140px]:ml-auto"
                    >
                        <ul className="m-0 flex list-none flex-wrap items-center justify-center p-0 min-[1140px]:justify-end">
                            {menu.map((item) => (
                                <DesktopNavItem key={item.id} item={item} />
                            ))}
                        </ul>
                    </nav>
                </div>

                {/* Mobile bar: inside the header band, below the logo. */}
                <div
                    className={clsx(
                        HEADER_CONTAINER,
                        "flex min-h-[50px] items-center justify-between gap-4 text-[15px] md:hidden",
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
