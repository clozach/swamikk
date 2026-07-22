import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import clsx from "clsx";
import { MenuItem } from "../settings";
import {
    NAV_LINK,
    NAV_LINK_METRICS,
    FLYOUT_PANEL,
    FLYOUT_LINK,
} from "./tokens";
import Chevron from "./chevron";

/* ------------------------------------------------------------------ *
 * State modes — discriminated unions, not flag bags
 * ------------------------------------------------------------------ */
type DropdownState =
    | { kind: "closed" }
    /* `via` is load-bearing: a menu opened by keyboard focus must survive a
       stray mouseleave, and a hover-opened one must close when the pointer
       leaves. A single `open` boolean cannot express that. */
    | { kind: "open"; via: "hover" | "focus" };

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
        if (typeof window === "undefined") {
            return;
        }
        // Deliberately not gated on `open`. A closed panel is only `invisible`,
        // not `display: none`, so it still occupies layout and still widens the
        // document if it sits past the right edge — the rightmost nav item's
        // flyout did exactly that. `offsetWidth` is measurable under
        // `visibility: hidden`, so clamping while closed is both valid and
        // necessary.

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

        // A single rAF is not enough on its own. The nav can be measured
        // before the header has its final layout — an anchor still reporting
        // left: 0 yields the `pad` fallback (8px) rather than a real clamp,
        // and nothing would ever correct it, because a closed flyout gets no
        // further renders. Observing both boxes re-measures whenever the row
        // reflows for any reason: fonts loading, the logo image arriving, a
        // sibling menu wrapping.
        const observer =
            typeof ResizeObserver === "undefined"
                ? undefined
                : new ResizeObserver(measure);
        if (observer) {
            const el = ref.current;
            if (el) {
                observer.observe(el);
            }
            if (el?.parentElement) {
                observer.observe(el.parentElement);
            }
        }

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("resize", measure);
            observer?.disconnect();
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
                // The clamp rides on margin, NOT transform. transform is
                // transitioned (FLYOUT_PANEL), and a closed panel is
                // `invisible` — it never paints, so its transition never
                // advances past whatever value it first rendered with. A
                // clamp carried on transform therefore computed the right
                // number, wrote it to the inline style, and was silently
                // swallowed: the rightmost flyout kept the pre-layout
                // offset it was born with and widened the document by 59px.
                // Margin is not transitioned, so the shift lands immediately
                // whether or not the panel has ever been drawn.
                marginLeft: `${shiftX}px`,
                // Closed panels sit 10px off and fade/slide into place.
                transform: open
                    ? "translate(0, 0)"
                    : placement === "below"
                      ? "translate(0, 10px)"
                      : `translate(${flipped ? -10 : 10}px, 0)`,
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

export default function DesktopNavItem({ item }: { item: MenuItem }) {
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
