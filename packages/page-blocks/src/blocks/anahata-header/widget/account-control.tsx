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
import LoginPanel from "./login-popover";

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

/* Inline two-click logout confirm with the Figma "wipe" animation. First click
 * arms; a rust panel (#993300 — the same red as the Log in pill) wipes in
 * left→right via clip-path over the resting row, flipping the text to the
 * light menu colour as it passes; the logout icon slides right and fades to 0
 * before the edge; a "?" fades in where it lands. A second click on the armed
 * control signs out. Arming is owned by the parent so Escape / a click
 * elsewhere can cancel it (reverses the same animation) without closing the
 * menu; `stopPropagation` lets an ancestor treat "any other click" as cancel.
 *
 * Two stacked layers share one row layout so the reveal reads as an in-place
 * recolour: the REST layer (dark, icon + label + an invisible "?" that just
 * reserves width so the control never resizes) sits under the WIPE layer
 * (rust ground, light content), which is clip-revealed. */
function LogoutButton({
    armed,
    onArm,
    variant,
}: {
    armed: boolean;
    onArm: () => void;
    variant: "menu" | "drawer";
}) {
    const isMenu = variant === "menu";
    const row =
        "flex w-full items-center gap-[11px] px-[10px] py-[9px] text-[13.5px] font-semibold leading-none whitespace-nowrap" +
        (isMenu ? "" : " uppercase tracking-[0.01em]");
    return (
        <button
            type="button"
            role={isMenu ? "menuitem" : undefined}
            aria-label={armed ? "Confirm log out" : accountLogoutLabel}
            className="group relative isolate flex w-full cursor-pointer overflow-hidden rounded-[6px] border-0 bg-transparent p-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--nav-fg-hover)]"
            onClick={(event) => {
                event.stopPropagation();
                if (armed) {
                    performSignOut();
                } else {
                    onArm();
                }
            }}
        >
            {/* REST layer — stays put; the wipe reveals over it. */}
            <span
                className={clsx(
                    row,
                    "relative z-[1]",
                    isMenu
                        ? "text-[var(--nav-fg)] group-hover:bg-[color-mix(in_srgb,var(--nav-fg-hover)_10%,transparent)] group-hover:text-[var(--nav-fg-hover)]"
                        : "text-white group-hover:text-[#ff9900]",
                )}
            >
                <LogoutIcon />
                <span>
                    {accountLogoutLabel}
                    <span aria-hidden="true" className="ml-[5px] opacity-0">
                        ?
                    </span>
                </span>
            </span>
            {/* WIPE layer — rust ground + light content, clip-revealed L→R. */}
            <span
                aria-hidden="true"
                className={clsx(
                    row,
                    "pointer-events-none absolute inset-0 z-[2] bg-[#993300] text-[#f7f4eb]",
                )}
                style={{
                    clipPath: armed ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
                    transition: "clip-path 300ms ease",
                }}
            >
                <span
                    className="flex shrink-0"
                    style={{
                        transform: armed ? "translateX(88px)" : "translateX(0)",
                        opacity: armed ? 0 : 1,
                        transition:
                            "transform 320ms ease, opacity 220ms ease-in",
                    }}
                >
                    <LogoutIcon />
                </span>
                <span>
                    {accountLogoutLabel}
                    <span
                        className="ml-[5px]"
                        style={{
                            opacity: armed ? 1 : 0,
                            transition: "opacity 200ms ease 140ms",
                        }}
                    >
                        ?
                    </span>
                </span>
            </span>
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
 * Signed-out control: the "Log in" pill opens the login popover right
 * beneath it (the OTP form happens contiguous to the button, not on a
 * whole-page /login). The pill is a real <a href="/login"> whose click is
 * intercepted only when JS can drive the popover — so no-JS, the page
 * builder (editing), and reCAPTCHA-configured sites all fall back to the
 * full /login page. Open/close is owned here (Escape + outside pointerdown),
 * matching the signed-in dropdown.
 * ------------------------------------------------------------------ */
const LOGIN_PANEL_ID = "anahata-login-panel";

function SignedOut({
    loginLabel,
    editing,
    recaptchaConfigured,
}: {
    loginLabel: string;
    editing: boolean;
    recaptchaConfigured: boolean;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLAnchorElement | null>(null);
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

    return (
        <div className="relative" ref={rootRef} onKeyDown={onKeyDown}>
            <a
                ref={triggerRef}
                href={accountLoginHref}
                className={ACCOUNT_LOGIN_PILL}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? LOGIN_PANEL_ID : undefined}
                onClick={(event) => {
                    if (editing || recaptchaConfigured) {
                        return; // let the /login href stand
                    }
                    event.preventDefault();
                    setOpen((current) => !current);
                }}
            >
                <PersonIcon />
                {loginLabel || defaultLoginLabel}
            </a>
            {open && <LoginPanel panelId={LOGIN_PANEL_ID} />}
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * The desktop account control. Signed-out renders the sign-in pill (+
 * popover); signed-in renders the avatar + dropdown. "Signed in" is read
 * straight off the profile the page already put in `state` — the same
 * `profile.email` test the app's own layouts use to set `auth.guest`. The
 * profile is fetched before the page paints for authenticated users, so the
 * pill never flashes ahead of the avatar.
 * ------------------------------------------------------------------ */
export default function AccountControl({
    profile,
    editing,
    loginLabel,
    recaptchaConfigured,
}: {
    profile: Profile | undefined;
    editing: boolean;
    loginLabel: string;
    recaptchaConfigured: boolean;
}) {
    const loggedIn = Boolean(profile?.email);

    if (loggedIn && profile) {
        return <SignedIn profile={profile} editing={editing} />;
    }

    return (
        <SignedOut
            loginLabel={loginLabel}
            editing={editing}
            recaptchaConfigured={recaptchaConfigured}
        />
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
