import {
    externalLinkProps,
    ExternalLinkLabel,
} from "@courselit/components-library";
import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Profile } from "@courselit/common-models";
import { MenuItem, TopBarItem } from "../settings";
import {
    DARK_SURFACE_VARS,
    DRAWER,
    FONT_BODY,
    MOBILE_ICON_BUTTON,
    MOBILE_LINK,
} from "./tokens";
import Chevron from "./chevron";
import { MobileAccountSection } from "./account-control";

export type MobileMenuState = { kind: "closed" } | { kind: "open" };

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
            style={{ borderBottomColor: "var(--nav-edge)" }}
        >
            <div className="flex items-stretch justify-between">
                <a
                    href={item.href || "#"}
                    {...externalLinkProps(item.href || "#")}
                    onClick={onNavigate}
                    className={clsx(MOBILE_LINK, "grow")}
                    style={{ paddingLeft: `${20 + depth * 16}px` }}
                >
                    <ExternalLinkLabel
                        newTab={
                            externalLinkProps(item.href || "#").target ===
                            "_blank"
                        }
                    >
                        {item.label}
                    </ExternalLinkLabel>
                </a>
                {hasChildren && (
                    <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Collapse" : "Expand"} ${
                            item.label
                        }`}
                        onClick={() => setExpanded((current) => !current)}
                        className={clsx(
                            "flex w-14 shrink-0 items-center justify-center focus-visible:outline-offset-[-2px]",
                            MOBILE_ICON_BUTTON,
                        )}
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
    profile: Profile | undefined;
    utilityItems: TopBarItem[];
    closeLabel: string;
}

export default function MobileOverlay({
    state,
    onClose,
    menu,
    profile,
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

    /* Keep the menu contained, but let a higher modal own focus/keyboard
       while it is open (for example a comment, upload or confirmation). */
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

        const higherModalOpen = () =>
            Array.from(
                document.querySelectorAll<HTMLElement>(
                    '[role="dialog"], [role="alertdialog"]',
                ),
            ).some((dialog) => {
                if (
                    dialog === panel ||
                    panel.contains(dialog) ||
                    dialog.dataset.state === "closed" ||
                    !dialog.getClientRects().length
                )
                    return false;
                const style = window.getComputedStyle(dialog);
                return (
                    style.visibility !== "hidden" && Number(style.zIndex) > 41
                );
            });

        const onKeyDown = (event: KeyboardEvent) => {
            if (higherModalOpen()) return;
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
            if (higherModalOpen()) return;
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
                    "fixed inset-0 z-40 bg-black transition-opacity duration-300 ease-in-out",
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
                    "fixed inset-y-0 right-0 z-[41] flex w-full max-w-full flex-col overflow-y-auto overscroll-contain pb-[30px] transition-transform duration-300 ease-in-out min-[480px]:w-[360px]",
                    entered ? "translate-x-0" : "translate-x-full",
                )}
                style={
                    {
                        backgroundColor: DRAWER,
                        fontFamily: FONT_BODY,
                        // The drawer sits outside the band, so it sets its own
                        // --nav-* set: always the dark surface, whatever the
                        // page theme.
                        ...DARK_SURFACE_VARS,
                    } as React.CSSProperties
                }
            >
                <div className="flex justify-end px-5 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className={clsx(
                            "px-5 py-[10px] font-bold leading-none focus-visible:outline-offset-2",
                            MOBILE_ICON_BUTTON,
                        )}
                        style={{
                            fontFamily: '"Times New Roman", Times, serif',
                            fontSize: "32px",
                        }}
                    >
                        <span aria-hidden="true">&times;</span>
                        <span className="sr-only">{closeLabel}</span>
                    </button>
                </div>
                {/* Account first: the drawer opens to who you are (or a clear
                    way in), above the site nav. */}
                <MobileAccountSection profile={profile} onNavigate={onClose} />
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
                                    {...externalLinkProps(item.href || "#")}
                                    onClick={onClose}
                                    className={MOBILE_LINK}
                                    style={{ paddingLeft: "20px" }}
                                >
                                    <ExternalLinkLabel
                                        newTab={
                                            externalLinkProps(item.href || "#")
                                                .target === "_blank"
                                        }
                                    >
                                        {item.label}
                                    </ExternalLinkLabel>
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
