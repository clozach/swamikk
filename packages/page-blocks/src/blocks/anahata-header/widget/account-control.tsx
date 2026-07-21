import React, { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Profile } from "@courselit/common-models";
import {
    accountLoginLabel as defaultLoginLabel,
    accountLoginHref,
    accountLoginMobileLabel,
    accountLoginMobileHint,
    accountManageLabel,
    accountManageHref,
    accountContentLabel,
    accountContentHref,
    accountLogoutLabel,
    accountLogoutConfirmLabel,
} from "../defaults";
import {
    ACCOUNT_LOGIN_PILL,
    ACCOUNT_TRIGGER,
    ACCOUNT_TRIGGER_NAME,
    ACCOUNT_AVATAR,
    ACCOUNT_MENU,
    ACCOUNT_MENU_ITEM,
    ACCOUNT_MENU_SEP,
    ACCOUNT_MOBILE_CTA,
    ACCOUNT_MOBILE_LINK,
} from "./tokens";
import Chevron from "./chevron";

/* ------------------------------------------------------------------ *
 * Inline SVGs. page-blocks does not depend on lucide (see theme-toggle.tsx),
 * so the account glyphs are hand-drawn here and inherit `currentColor`,
 * staying AA in both bands without a second palette.
 * ------------------------------------------------------------------ */
function PersonIcon({ size = 16 }: { size?: number }) {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            className="shrink-0"
        >
            <circle
                cx="12"
                cy="8"
                r="3.4"
                stroke="currentColor"
                strokeWidth="1.8"
            />
            <path
                d="M5.5 19.5a6.5 6.5 0 0 1 13 0"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    );
}

function GridIcon() {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            className="shrink-0"
        >
            <rect
                x="3.5"
                y="4.5"
                width="7"
                height="7"
                rx="1.2"
                stroke="currentColor"
                strokeWidth="1.8"
            />
            <rect
                x="13.5"
                y="4.5"
                width="7"
                height="7"
                rx="1.2"
                stroke="currentColor"
                strokeWidth="1.8"
            />
            <rect
                x="3.5"
                y="14.5"
                width="7"
                height="5"
                rx="1.2"
                stroke="currentColor"
                strokeWidth="1.8"
            />
            <rect
                x="13.5"
                y="14.5"
                width="7"
                height="5"
                rx="1.2"
                stroke="currentColor"
                strokeWidth="1.8"
            />
        </svg>
    );
}

function LogoutIcon() {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            className="shrink-0"
        >
            <path
                d="M15 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
            <path
                d="M18.5 12H10m8.5 0-3-3m3 3-3 3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/* First-plus-second initial, matching the dashboard's own NavUser alias. */
function initials(name?: string): string {
    return (name ?? "")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase() ?? "")
        .join("");
}

function Avatar({ profile }: { profile: Profile }) {
    const thumb = profile.avatar?.thumbnail;
    const alias = initials(profile.name) || "•";
    return (
        <span className={ACCOUNT_AVATAR} aria-hidden="true">
            {thumb ? (
                <img
                    src={thumb}
                    alt=""
                    className="h-full w-full object-cover"
                    width={34}
                    height={34}
                />
            ) : (
                alias
            )}
        </span>
    );
}

/* Sign out in place, mirroring what authClient.signOut() does under the hood
 * (POST the better-auth sign-out endpoint, then land on /login) — kept as a
 * plain same-origin fetch so the block needs no auth SDK. The redirect runs
 * whether or not the POST succeeds: /login is a safe landing either way, and a
 * failed sign-out simply shows the form while the session lingers, rather than
 * stranding the user on a dead control. */
function performSignOut(): void {
    void fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        credentials: "same-origin",
    })
        .catch(() => undefined)
        .finally(() => {
            window.location.href = accountLoginHref;
        });
}

/* Inline two-click logout confirm (Al's spec): the control arms in place to
 * read "Log out?" on first click and signs out on the second — no navigation
 * to the whole-page /logout confirmation. Arming is owned by the parent so it
 * can be cancelled by Escape / clicking elsewhere without closing the whole
 * menu. `stopPropagation` lets an ancestor's onClick treat "any click that
 * isn't this button" as a cancel. */
function LogoutButton({
    armed,
    onArm,
    variant,
}: {
    armed: boolean;
    onArm: () => void;
    variant: "menu" | "drawer";
}) {
    const armedClass =
        variant === "menu"
            ? "bg-[color-mix(in_srgb,var(--nav-fg-hover)_14%,transparent)] text-[var(--nav-fg-hover)]"
            : "text-[#ff9900]";
    return (
        <button
            type="button"
            role={variant === "menu" ? "menuitem" : undefined}
            aria-label={armed ? "Confirm log out" : accountLogoutLabel}
            className={clsx(
                variant === "menu" ? ACCOUNT_MENU_ITEM : ACCOUNT_MOBILE_LINK,
                variant === "drawer" && "w-full text-left",
                armed && armedClass,
            )}
            onClick={(event) => {
                event.stopPropagation();
                if (armed) {
                    performSignOut();
                } else {
                    onArm();
                }
            }}
        >
            <LogoutIcon />
            {armed ? accountLogoutConfirmLabel : accountLogoutLabel}
        </button>
    );
}

/* ------------------------------------------------------------------ *
 * Signed-in dropdown. Behaviour mirrors the nav flyout's tap-open menu
 * (see ./desktop-nav.tsx): click toggles, Escape closes and returns focus
 * to the trigger, an outside pointerdown closes. The panel is right-anchored
 * so it cannot leave the viewport. Log out is an inline two-click confirm
 * (see LogoutButton) whose armed state Escape / a click elsewhere cancels
 * before it would close the menu.
 * ------------------------------------------------------------------ */
function SignedIn({
    profile,
    editing,
}: {
    profile: Profile;
    editing: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [confirmingLogout, setConfirmingLogout] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);

    // Closing always disarms the logout confirm, so re-opening starts clean.
    const close = useCallback(() => {
        setOpen(false);
        setConfirmingLogout(false);
    }, []);

    useEffect(() => {
        if (!open || typeof document === "undefined") {
            return;
        }
        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                close();
            }
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open, close]);

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Escape" || !open) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        // Escape disarms an armed logout first, leaving the menu open; only a
        // second Escape closes the menu. Matches "Esc cancels back to Log out".
        if (confirmingLogout) {
            setConfirmingLogout(false);
            return;
        }
        close();
        triggerRef.current?.focus();
    };

    const firstName = profile.name?.split(" ")[0];

    return (
        <div className="relative" ref={rootRef} onKeyDown={onKeyDown}>
            <button
                ref={triggerRef}
                type="button"
                className={ACCOUNT_TRIGGER}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={
                    firstName ? `Account menu for ${firstName}` : "Account menu"
                }
                onClick={() => {
                    if (!editing) {
                        setOpen((current) => !current);
                    }
                }}
            >
                <Avatar profile={profile} />
                {firstName && (
                    <span className={ACCOUNT_TRIGGER_NAME}>{firstName}</span>
                )}
                <span className="flex text-[var(--nav-fg)]">
                    <Chevron direction="down" />
                </span>
            </button>
            {open && (
                <div
                    className={ACCOUNT_MENU}
                    role="menu"
                    // Any click inside the panel that isn't the (stopPropagation)
                    // logout button counts as "elsewhere" and disarms the confirm.
                    onClick={() => {
                        if (confirmingLogout) {
                            setConfirmingLogout(false);
                        }
                    }}
                >
                    <div className="flex items-center gap-[11px] px-[10px] pb-[12px] pt-[9px]">
                        <Avatar profile={profile} />
                        <span className="min-w-0">
                            {profile.name && (
                                <span className="block truncate text-[14px] font-bold text-[var(--nav-fg)]">
                                    {profile.name}
                                </span>
                            )}
                            <span className="block truncate text-[12px] text-[var(--nav-fg)] opacity-70">
                                {profile.email}
                            </span>
                        </span>
                    </div>
                    <div className={ACCOUNT_MENU_SEP} />
                    <a
                        href={accountManageHref}
                        role="menuitem"
                        className={ACCOUNT_MENU_ITEM}
                    >
                        <PersonIcon size={17} />
                        {accountManageLabel}
                    </a>
                    <a
                        href={accountContentHref}
                        role="menuitem"
                        className={ACCOUNT_MENU_ITEM}
                    >
                        <GridIcon />
                        {accountContentLabel}
                    </a>
                    <div className={ACCOUNT_MENU_SEP} />
                    <LogoutButton
                        armed={confirmingLogout}
                        onArm={() => setConfirmingLogout(true)}
                        variant="menu"
                    />
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * The desktop account control. Signed-out renders the sign-in pill;
 * signed-in renders the avatar + dropdown. "Signed in" is read straight
 * off the profile the page already put in `state` — the same `profile.email`
 * test the app's own layouts use to set `auth.guest`. The profile is fetched
 * before the page paints for authenticated users, so the pill never flashes
 * ahead of the avatar.
 * ------------------------------------------------------------------ */
export default function AccountControl({
    profile,
    editing,
    loginLabel,
}: {
    profile: Profile | undefined;
    editing: boolean;
    loginLabel: string;
}) {
    const loggedIn = Boolean(profile?.email);

    if (loggedIn && profile) {
        return <SignedIn profile={profile} editing={editing} />;
    }

    return (
        <a href={accountLoginHref} className={ACCOUNT_LOGIN_PILL}>
            <PersonIcon />
            {loginLabel || defaultLoginLabel}
        </a>
    );
}

/* ------------------------------------------------------------------ *
 * The phone's account presence, rendered at the top of the drawer (the
 * desktop control is hidden below 768px). Signed-out gets a prominent
 * "Log in / Create account" CTA; signed-in gets the member's identity and
 * the same three destinations as the desktop menu, flattened into the
 * drawer since it is already a single scrolling column. `onNavigate` closes
 * the drawer, matching every other link in it.
 * ------------------------------------------------------------------ */
export function MobileAccountSection({
    profile,
    onNavigate,
}: {
    profile: Profile | undefined;
    onNavigate: () => void;
}) {
    // Declared before the early return so the hook order stays stable.
    const [confirmingLogout, setConfirmingLogout] = useState(false);
    const loggedIn = Boolean(profile?.email);

    if (!loggedIn || !profile) {
        return (
            <div className="flex flex-col gap-[9px] border-b border-solid border-[rgba(255,255,255,0.09)] px-5 pb-[14px] pt-[6px]">
                <a
                    href={accountLoginHref}
                    onClick={onNavigate}
                    className={ACCOUNT_MOBILE_CTA}
                >
                    <PersonIcon />
                    {accountLoginMobileLabel}
                </a>
                <span className="text-center text-[11.5px] text-[#c9c1b2]">
                    {accountLoginMobileHint}
                </span>
            </div>
        );
    }

    return (
        <div
            className="border-b border-solid border-[rgba(255,255,255,0.09)] px-5 pb-[10px] pt-[2px]"
            // A tap anywhere in the block that isn't the (stopPropagation)
            // logout button disarms the confirm — the mobile "click elsewhere".
            onClick={() => {
                if (confirmingLogout) {
                    setConfirmingLogout(false);
                }
            }}
        >
            <div className="mb-[10px] flex items-center gap-[11px]">
                <Avatar profile={profile} />
                <span className="min-w-0">
                    {profile.name && (
                        <span className="block truncate text-[14px] font-bold text-white">
                            {profile.name}
                        </span>
                    )}
                    <span className="block truncate text-[12px] text-[#c9c1b2]">
                        {profile.email}
                    </span>
                </span>
            </div>
            <a
                href={accountManageHref}
                onClick={onNavigate}
                className={ACCOUNT_MOBILE_LINK}
            >
                <PersonIcon size={17} />
                {accountManageLabel}
            </a>
            <a
                href={accountContentHref}
                onClick={onNavigate}
                className={ACCOUNT_MOBILE_LINK}
            >
                <GridIcon />
                {accountContentLabel}
            </a>
            <LogoutButton
                armed={confirmingLogout}
                onArm={() => setConfirmingLogout(true)}
                variant="drawer"
            />
        </div>
    );
}
