import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { WidgetProps } from "@courselit/common-models";
import clsx from "clsx";
import Settings, { MenuItem, TopBarItem } from "./settings";
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
} from "./defaults";

/* ------------------------------------------------------------------ *
 * Palette + type — the Anahata design system tokens.
 * Used as raw hex in inline styles (grounds, borders) and as literal
 * Tailwind arbitrary values inside the class strings below, so the
 * package's own Tailwind pass emits them into dist/index.css.
 *   cream #f7f4eb · cocoa #312110 · ink #545454 · saffron #ff9900
 *   rust #993300 · amber #ffbf00 · drawer #262626
 * ------------------------------------------------------------------ */
const CREAM = "#f7f4eb";
const COCOA = "#312110";
const RUST = "#993300";
const AMBER = "#ffbf00";
const DRAWER = "#262626";
const FONT_BODY =
    'var(--font-open-sans), "Open Sans", -apple-system, "Segoe UI", sans-serif';

/* Container: 1212px fixed, 95% below that; the header band goes
   full-bleed from 961px up, as #site-header-inner does on the live site. */
const TOP_BAR_CONTAINER = "mx-auto w-[1212px] max-w-[95%]";
const HEADER_CONTAINER =
    "mx-auto w-[1212px] max-w-[95%] min-[961px]:w-full min-[961px]:max-w-none min-[961px]:px-6";

const TOP_BAR_LINK =
    "text-[14px] leading-[1.65] text-white no-underline transition-opacity duration-100 ease-in hover:opacity-80 focus-visible:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff9900]";

const NAV_LINK =
    "flex h-[50px] items-center whitespace-nowrap font-bold uppercase leading-[50px] text-[#545454] no-underline transition-colors duration-100 ease-in hover:text-[#ff9900] focus-visible:text-[#ff9900] active:text-[#993300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]";
const NAV_LINK_METRICS =
    "px-[25px] text-[16px] max-[1419px]:px-[20px] max-[1419px]:text-[15px] max-[1309px]:px-[13px] max-[1309px]:text-[14px] max-[829px]:px-[10px]";

const FLYOUT_PANEL =
    "absolute z-[10001] min-w-[140px] max-w-[280px] border-t-[5px] border-solid border-t-[#ff9900] bg-white p-[10px] text-left shadow-[0_3px_10px_rgba(0,0,0,0.1)] transition-[opacity,transform] duration-200 ease-out";
const FLYOUT_LINK =
    "block px-[10px] py-[6px] text-[14px] uppercase leading-[1.4] text-[#545454] no-underline transition-colors duration-100 ease-in hover:text-[#ff9900] focus-visible:text-[#ff9900] active:text-[#993300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]";

const MOBILE_LINK =
    "block py-[0.9em] pr-5 text-[14px] uppercase text-white no-underline transition-colors duration-100 ease-in hover:text-[#ff9900] focus-visible:text-[#ff9900] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#ff9900]";

/* ------------------------------------------------------------------ *
 * State modes — discriminated unions, not flag bags
 * ------------------------------------------------------------------ */
type DropdownState =
    | { kind: "closed" }
    /* `via` is load-bearing: a menu opened by keyboard focus must survive a
       stray mouseleave, and a hover-opened one must close when the pointer
       leaves. A single `open` boolean cannot express that. */
    | { kind: "open"; via: "hover" | "focus" };

type MobileMenuState = { kind: "closed" } | { kind: "open" };

type Placement = "below" | "side";

/* React logs "useLayoutEffect does nothing on the server" for every client
   component that calls it during SSR — once per nav item with a flyout, which
   is a wall of noise. Measurement must still happen before paint in the
   browser, so pick the hook by environment rather than dropping to useEffect. */
const useIsomorphicLayoutEffect =
    typeof window === "undefined" ? useEffect : useLayoutEffect;

/* ------------------------------------------------------------------ *
 * Viewport clamp. Measures the ANCHOR (parent <li>) plus the panel's own
 * width, so the answer never depends on a shift/flip already applied —
 * no feedback loop, and no flyout can leave the viewport or widen it.
 * ------------------------------------------------------------------ */
function useFlyoutClamp(open: boolean, placement: Placement) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [shiftX, setShiftX] = useState(0);
    const [flipped, setFlipped] = useState(false);

    useIsomorphicLayoutEffect(() => {
        if (!open || typeof window === "undefined") {
            return;
        }

        const measure = () => {
            const el = ref.current;
            const anchor = el?.parentElement;
            if (!el || !anchor) {
                return;
            }
            const pad = 8;
            const viewportWidth = document.documentElement.clientWidth;
            const anchorRect = anchor.getBoundingClientRect();
            const width = el.offsetWidth;
            const limit = viewportWidth - pad;

            if (placement === "side") {
                if (anchorRect.right + width <= limit) {
                    setFlipped(false);
                    setShiftX(0);
                    return;
                }
                if (anchorRect.left - width >= pad) {
                    setFlipped(true);
                    setShiftX(0);
                    return;
                }
                // Neither side fits: keep it right-opening and pull it in.
                let shift = Math.min(0, limit - (anchorRect.right + width));
                if (anchorRect.right + shift < pad) {
                    shift = pad - anchorRect.right;
                }
                setFlipped(false);
                setShiftX(shift);
                return;
            }

            let shift = 0;
            if (anchorRect.left + width > limit) {
                shift = limit - (anchorRect.left + width);
            }
            if (anchorRect.left + shift < pad) {
                shift = pad - anchorRect.left;
            }
            setFlipped(false);
            setShiftX(shift);
        };

        measure();
        // Web fonts settle a frame late and change the panel's width.
        const frame = requestAnimationFrame(measure);
        window.addEventListener("resize", measure);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("resize", measure);
        };
    }, [open, placement]);

    return { ref, shiftX, flipped };
}

/* ------------------------------------------------------------------ *
 * Shared hover/focus behaviour for a nav item that owns a flyout
 * ------------------------------------------------------------------ */
function useDropdown(hasChildren: boolean) {
    const [state, setState] = useState<DropdownState>({ kind: "closed" });

    const close = useCallback(() => setState({ kind: "closed" }), []);

    const handlers = hasChildren
        ? {
              onMouseEnter: () =>
                  setState((current) =>
                      current.kind === "open"
                          ? current
                          : { kind: "open" as const, via: "hover" as const },
                  ),
              onMouseLeave: () =>
                  setState((current) =>
                      current.kind === "open" && current.via === "focus"
                          ? current
                          : { kind: "closed" as const },
                  ),
              onFocus: () =>
                  setState({ kind: "open" as const, via: "focus" as const }),
              onBlur: (event: React.FocusEvent<HTMLLIElement>) => {
                  if (
                      !event.currentTarget.contains(
                          event.relatedTarget as Node | null,
                      )
                  ) {
                      setState({ kind: "closed" });
                  }
              },
          }
        : {};

    /* Pin the flyout open the way a keyboard focus does. Used by the tap
       handler below: on a touch device there is no hover, so without this the
       whole second and third level of the menu is unreachable between 768px
       (where the desktop nav appears) and 1140px — i.e. on every tablet. */
    const pin = useCallback(() => setState({ kind: "open", via: "focus" }), []);

    return { open: state.kind === "open", close, pin, handlers };
}

/** True when a link exists only to carry a submenu, so intercepting its tap
 *  costs the user nothing. A parent with a real destination (Shop) still
 *  navigates on tap, exactly as it does on the live site. */
function isPlaceholderHref(href: string | undefined): boolean {
    return !href || href === "#";
}

/* ------------------------------------------------------------------ *
 * Desktop flyouts — level 2 opens below, level 3 flies to the side
 * ------------------------------------------------------------------ */
interface FlyoutProps {
    items: MenuItem[];
    open: boolean;
    placement: Placement;
}

function Flyout({ items, open, placement }: FlyoutProps) {
    const { ref, shiftX, flipped } = useFlyoutClamp(open, placement);

    return (
        <div
            ref={ref}
            aria-hidden={!open}
            className={clsx(
                FLYOUT_PANEL,
                placement === "below"
                    ? "left-0 top-full"
                    : flipped
                      ? "right-full top-0"
                      : "left-full top-0",
                open
                    ? "visible opacity-100"
                    : "pointer-events-none invisible opacity-0",
            )}
            style={{
                // Closed panels sit 10px off and fade/slide into place.
                transform: open
                    ? `translate(${shiftX}px, 0)`
                    : placement === "below"
                      ? `translate(${shiftX}px, 10px)`
                      : `translate(${shiftX + (flipped ? -10 : 10)}px, 0)`,
            }}
        >
            <ul className="m-0 flex list-none flex-col p-0">
                {items.map((child) => (
                    <FlyoutItem key={child.id} item={child} parentOpen={open} />
                ))}
            </ul>
        </div>
    );
}

function FlyoutItem({
    item,
    parentOpen,
}: {
    item: MenuItem;
    parentOpen: boolean;
}) {
    const hasChildren = Boolean(item.children && item.children.length);
    const { open, close, handlers } = useDropdown(hasChildren);
    const isOpen = parentOpen && open;

    // A collapsed parent must not leave a nested panel open behind it.
    useEffect(() => {
        if (!parentOpen) {
            close();
        }
    }, [parentOpen, close]);

    return (
        <li className="relative m-0 list-none p-0" {...handlers}>
            <a
                href={item.href || "#"}
                className={clsx(
                    FLYOUT_LINK,
                    hasChildren && "flex items-center justify-between gap-2",
                )}
                // Closed panels stay out of the tab order; focusing the
                // trigger opens the panel, which makes them reachable.
                tabIndex={parentOpen ? 0 : -1}
                aria-haspopup={hasChildren || undefined}
                aria-expanded={hasChildren ? isOpen : undefined}
            >
                {item.label}
                {hasChildren && <Chevron direction="right" />}
            </a>
            {hasChildren && (
                <Flyout
                    items={item.children as MenuItem[]}
                    open={isOpen}
                    placement="side"
                />
            )}
        </li>
    );
}

function DesktopNavItem({ item }: { item: MenuItem }) {
    const hasChildren = Boolean(item.children && item.children.length);
    const { open, close, pin, handlers } = useDropdown(hasChildren);
    const triggerRef = useRef<HTMLAnchorElement | null>(null);
    const itemRef = useRef<HTMLLIElement | null>(null);
    const tapOpens = hasChildren && isPlaceholderHref(item.href);

    /* A tap-opened flyout is pinned, so it survives mouseleave and (on touch,
       where nothing steals focus) would otherwise stay up forever. Dismiss it
       the way every other menu does: press outside. */
    useEffect(() => {
        if (!open || typeof document === "undefined") {
            return;
        }
        const onPointerDown = (event: PointerEvent) => {
            if (!itemRef.current?.contains(event.target as Node)) {
                close();
            }
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open, close]);

    const onKeyDown = (event: React.KeyboardEvent<HTMLLIElement>) => {
        if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            close();
            triggerRef.current?.focus();
        }
    };

    return (
        <li
            ref={itemRef}
            className="relative m-0 list-none p-0"
            {...handlers}
            onKeyDown={hasChildren ? onKeyDown : undefined}
        >
            <a
                ref={triggerRef}
                href={item.href || "#"}
                className={clsx(NAV_LINK, NAV_LINK_METRICS)}
                aria-haspopup={hasChildren || undefined}
                aria-expanded={hasChildren ? open : undefined}
                onClick={
                    tapOpens
                        ? (event) => {
                              // "#" goes nowhere; spend the tap on the submenu.
                              event.preventDefault();
                              if (open) {
                                  close();
                              } else {
                                  pin();
                              }
                          }
                        : undefined
                }
            >
                {item.label}
            </a>
            {hasChildren && (
                <Flyout
                    items={item.children as MenuItem[]}
                    open={open}
                    placement="below"
                />
            )}
        </li>
    );
}

function Chevron({ direction }: { direction: "right" | "down" }) {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={clsx(
                "shrink-0 transition-transform duration-200 ease-out",
                direction === "down" && "rotate-90",
            )}
        >
            <path
                d="M3 1l4 4-4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/* ------------------------------------------------------------------ *
 * Cocoa utility strip
 * ------------------------------------------------------------------ */
function TopBar({ left, right }: { left: TopBarItem[]; right: TopBarItem[] }) {
    return (
        // The whole strip drops out below 560px, as on the live site.
        <div
            className="hidden min-[560px]:block"
            style={{ backgroundColor: COCOA, color: "#ffffff" }}
        >
            <div
                className={clsx(
                    TOP_BAR_CONTAINER,
                    "flex items-center justify-between py-[6px]",
                )}
            >
                <ul className="m-0 flex list-none flex-wrap items-center gap-x-5 gap-y-1 p-0">
                    {left.map((item) => (
                        <li key={item.id} className="m-0 list-none p-0">
                            <a href={item.href || "#"} className={TOP_BAR_LINK}>
                                {item.label}
                            </a>
                        </li>
                    ))}
                </ul>
                {/* The right group drops out at the mobile breakpoint. */}
                <ul className="m-0 hidden list-none items-center gap-x-5 p-0 pt-[5px] md:flex">
                    {right.map((item) => (
                        <li key={item.id} className="m-0 list-none p-0">
                            <a href={item.href || "#"} className={TOP_BAR_LINK}>
                                {item.label}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * Mobile overlay
 * ------------------------------------------------------------------ */
function MobileBranch({
    item,
    depth,
    onNavigate,
}: {
    item: MenuItem;
    depth: number;
    onNavigate: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const hasChildren = Boolean(item.children && item.children.length);

    return (
        <li
            className="m-0 list-none border-b border-solid p-0"
            style={{ borderBottomColor: "rgba(255,255,255,0.06)" }}
        >
            <div className="flex items-stretch justify-between">
                <a
                    href={item.href || "#"}
                    onClick={onNavigate}
                    className={clsx(MOBILE_LINK, "grow")}
                    style={{ paddingLeft: `${20 + depth * 16}px` }}
                >
                    {item.label}
                </a>
                {hasChildren && (
                    <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Collapse" : "Expand"} ${
                            item.label
                        }`}
                        onClick={() => setExpanded((current) => !current)}
                        className="flex w-14 shrink-0 items-center justify-center text-white transition-colors duration-100 ease-in hover:text-[#ff9900] focus-visible:text-[#ff9900] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#ff9900]"
                    >
                        <Chevron direction={expanded ? "down" : "right"} />
                    </button>
                )}
            </div>
            {hasChildren && expanded && (
                <ul className="m-0 list-none p-0">
                    {(item.children as MenuItem[]).map((child) => (
                        <MobileBranch
                            key={child.id}
                            item={child}
                            depth={depth + 1}
                            onNavigate={onNavigate}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}

interface MobileOverlayProps {
    state: MobileMenuState;
    onClose: () => void;
    menu: MenuItem[];
    utilityItems: TopBarItem[];
    closeLabel: string;
}

function MobileOverlay({
    state,
    onClose,
    menu,
    utilityItems,
    closeLabel,
}: MobileOverlayProps) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [entered, setEntered] = useState(false);
    const open = state.kind === "open";

    /* Slide in: mount first, flip the transform on the next frame. */
    useEffect(() => {
        if (!open) {
            setEntered(false);
            return;
        }
        const frame = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(frame);
    }, [open]);

    /* The overlay only exists below 768px. If the viewport grows past that
       while it is up, close it — otherwise the scroll lock and the focus
       trap would outlive a panel the user can no longer see. */
    useEffect(() => {
        if (!open || typeof window === "undefined") {
            return;
        }
        const onResize = () => {
            if (window.innerWidth >= 768) {
                onClose();
            }
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [open, onClose]);

    /* Focus containment. While the overlay is up it owns the keyboard:
       Escape and Tab are consumed in the capture phase, every other
       keystroke aimed outside the panel is swallowed, and focus is pulled
       back if anything steals it — nothing reaches the page beneath. */
    useEffect(() => {
        if (!open || typeof window === "undefined") {
            return;
        }
        const panel = panelRef.current;
        if (!panel) {
            return;
        }

        const previouslyFocused = document.activeElement as HTMLElement | null;
        const focusables = () =>
            Array.from(
                panel.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
                ),
            ).filter((node) => node.offsetParent !== null);

        focusables()[0]?.focus();

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopImmediatePropagation();
                onClose();
                return;
            }
            if (event.key === "Tab") {
                const list = focusables();
                event.preventDefault();
                event.stopImmediatePropagation();
                if (!list.length) {
                    return;
                }
                const index = list.indexOf(
                    document.activeElement as HTMLElement,
                );
                const next = event.shiftKey
                    ? list[(index <= 0 ? list.length : index) - 1]
                    : list[(index + 1) % list.length];
                next?.focus();
                return;
            }
            if (!panel.contains(event.target as Node)) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        };

        const onFocusIn = (event: FocusEvent) => {
            if (!panel.contains(event.target as Node)) {
                focusables()[0]?.focus();
            }
        };

        window.addEventListener("keydown", onKeyDown, true);
        document.addEventListener("focusin", onFocusIn, true);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            window.removeEventListener("keydown", onKeyDown, true);
            document.removeEventListener("focusin", onFocusIn, true);
            document.body.style.overflow = previousOverflow;
            previouslyFocused?.focus?.();
        };
    }, [open, onClose]);

    if (!open) {
        return null;
    }

    return (
        <div className="md:hidden">
            <div
                aria-hidden="true"
                onClick={onClose}
                className={clsx(
                    "fixed inset-0 z-[9999] bg-black transition-opacity duration-300 ease-in-out",
                    entered ? "opacity-60" : "opacity-0",
                )}
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="Site menu"
                className={clsx(
                    // Full-screen on phones; a 360px drawer from 480px up,
                    // where there is room for a clickable backdrop.
                    "fixed inset-y-0 right-0 z-[10000] flex w-full max-w-full flex-col overflow-y-auto overscroll-contain pb-[30px] transition-transform duration-300 ease-in-out min-[480px]:w-[360px]",
                    entered ? "translate-x-0" : "translate-x-full",
                )}
                style={{ backgroundColor: DRAWER, fontFamily: FONT_BODY }}
            >
                <div className="flex justify-end px-5 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-[10px] font-bold leading-none text-white transition-colors duration-100 ease-in hover:text-[#ff9900] focus-visible:text-[#ff9900] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff9900]"
                        style={{
                            fontFamily: '"Times New Roman", Times, serif',
                            fontSize: "32px",
                        }}
                    >
                        <span aria-hidden="true">&times;</span>
                        <span className="sr-only">{closeLabel}</span>
                    </button>
                </div>
                <nav aria-label="Site">
                    <ul className="m-0 list-none p-0">
                        {menu.map((item) => (
                            <MobileBranch
                                key={item.id}
                                item={item}
                                depth={0}
                                onNavigate={onClose}
                            />
                        ))}
                    </ul>
                </nav>
                {utilityItems.length > 0 && (
                    <ul className="m-0 mt-4 list-none p-0">
                        {utilityItems.map((item) => (
                            <li key={item.id} className="m-0 list-none p-0">
                                <a
                                    href={item.href || "#"}
                                    onClick={onClose}
                                    className={MOBILE_LINK}
                                    style={{ paddingLeft: "20px" }}
                                >
                                    {item.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

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
                        className="flex items-center gap-[10px] uppercase text-[#545454] transition-colors duration-100 ease-in hover:text-[#ff9900] focus-visible:text-[#ff9900] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]"
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
                        className="inline-block whitespace-nowrap rounded-[4px] border border-solid border-white px-[25px] uppercase leading-[2em] text-[#545454] no-underline transition-colors duration-100 ease-in hover:bg-white/10 hover:text-[#ff9900] focus-visible:text-[#ff9900] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300] max-[479px]:px-[15px]"
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
