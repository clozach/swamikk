import React, { useCallback, useEffect, useRef, useState } from "react";
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
    accountLogoutHref,
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

/* ------------------------------------------------------------------ *
 * Signed-in dropdown. Behaviour mirrors the nav flyout's tap-open menu
 * (see ./desktop-nav.tsx): click toggles, Escape closes and returns focus
 * to the trigger, an outside pointerdown closes. The panel is right-anchored
 * so it cannot leave the viewport.
 * ------------------------------------------------------------------ */
function SignedIn({
    profile,
    editing,
}: {
    profile: Profile;
    editing: boolean;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);

    const close = useCallback(() => setOpen(false), []);

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
        if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            close();
            triggerRef.current?.focus();
        }
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
                <div className={ACCOUNT_MENU} role="menu">
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
                    <a
                        href={accountLogoutHref}
                        role="menuitem"
                        className={ACCOUNT_MENU_ITEM}
                    >
                        <LogoutIcon />
                        {accountLogoutLabel}
                    </a>
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
        <div className="border-b border-solid border-[rgba(255,255,255,0.09)] px-5 pb-[10px] pt-[2px]">
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
            <a
                href={accountLogoutHref}
                onClick={onNavigate}
                className={ACCOUNT_MOBILE_LINK}
            >
                <LogoutIcon />
                {accountLogoutLabel}
            </a>
        </div>
    );
}
