import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
    accountLoginPanelHeading,
    accountLoginCodeHeadingPrefix,
    accountLoginGetCodeLabel,
    accountLoginContinueLabel,
    accountLoginResendLabel,
    accountLoginResendPrompt,
} from "../defaults";

/* ------------------------------------------------------------------ *
 * Login panel — the OTP sign-in form, rendered as a popover anchored to
 * the "Log in" pill so signing in happens right where the button is,
 * instead of a whole-page /login trip. It replays exactly what the
 * /login page's LoginForm does — the two better-auth email-OTP calls —
 * as plain same-origin fetches, so the block still carries no auth SDK.
 * On success it reloads in place (the header then shows the avatar); it
 * never redirects to the dashboard, keeping the user where they were.
 *
 * reCAPTCHA: when the site configures a key, the parent renders the pill
 * as a real link to /login instead of opening this panel, so the
 * reCAPTCHA-guarded path is never bypassed (this panel has no key).
 * ------------------------------------------------------------------ */

const PANEL =
    "absolute right-0 top-[calc(100%+8px)] z-[10001] w-[300px] max-w-[calc(100vw-24px)] rounded-b-[8px] border-t-[5px] border-solid border-t-[var(--nav-panel-border)] bg-[var(--nav-panel-bg)] p-[16px] text-left shadow-[0_8px_26px_rgba(0,0,0,0.18)]";
const HEADING =
    "mb-[12px] text-[14px] font-semibold leading-[1.35] text-[var(--nav-fg)]";
const INPUT =
    "w-full rounded-[6px] border border-solid border-[#cdb98e] bg-transparent px-[12px] py-[10px] text-[14px] text-[var(--nav-fg)] outline-none transition-colors placeholder:text-[color-mix(in_srgb,var(--nav-fg)_50%,transparent)] focus:border-[var(--nav-fg-hover)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--nav-fg-hover)_28%,transparent)]";
const SUBMIT =
    "mt-[10px] w-full rounded-[6px] bg-[#ff9900] px-[16px] py-[10px] text-[14px] font-bold text-[#312110] transition-colors duration-100 ease-in hover:bg-[#ffbf00] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffbf00]";

async function postJson(
    url: string,
    body: Record<string, unknown>,
): Promise<{ ok: boolean; message?: string }> {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            credentials: "same-origin",
        });
        if (res.ok) {
            return { ok: true };
        }
        let message = "";
        try {
            const data = await res.json();
            message = data?.message || data?.error?.message || "";
        } catch {
            /* non-JSON error body */
        }
        return { ok: false, message };
    } catch {
        return { ok: false, message: "Network error — please try again." };
    }
}

export default function LoginPanel({ panelId }: { panelId?: string }) {
    const [stage, setStage] = useState<"email" | "code">("email");
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const emailRef = useRef<HTMLInputElement | null>(null);
    const codeRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        // Focus the field for the current stage when it appears.
        (stage === "email" ? emailRef : codeRef).current?.focus();
    }, [stage]);

    const sendCode = async (event: React.FormEvent) => {
        event.preventDefault();
        const trimmed = email.trim().toLowerCase();
        if (!trimmed || loading) {
            return;
        }
        setLoading(true);
        setError("");
        const { ok, message } = await postJson(
            "/api/auth/email-otp/send-verification-otp",
            { email: trimmed, type: "sign-in" },
        );
        setLoading(false);
        if (ok) {
            setStage("code");
        } else {
            setError(message || "Couldn't send the code — please try again.");
        }
    };

    const verifyCode = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!code.trim() || loading) {
            return;
        }
        setLoading(true);
        setError("");
        const { ok, message } = await postJson("/api/auth/sign-in/email-otp", {
            email: email.trim().toLowerCase(),
            otp: code.trim(),
        });
        if (ok) {
            // Reload in place: the profile refetches and the header swaps the
            // pill for the avatar, without leaving the page.
            window.location.reload();
            return;
        }
        setLoading(false);
        setError(message || "That code didn't work — check it and try again.");
    };

    return (
        <div id={panelId} role="dialog" aria-label="Sign in" className={PANEL}>
            {error && (
                <p className="mb-[10px] text-[12.5px] leading-[1.4] text-[var(--nav-fg-hover)]">
                    {error}
                </p>
            )}
            {stage === "email" ? (
                <form onSubmit={sendCode}>
                    <p className={HEADING}>{accountLoginPanelHeading}</p>
                    <input
                        ref={emailRef}
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={INPUT}
                    />
                    <button type="submit" disabled={loading} className={SUBMIT}>
                        {loading ? "Sending…" : accountLoginGetCodeLabel}
                    </button>
                </form>
            ) : (
                <form onSubmit={verifyCode}>
                    <p className={HEADING}>
                        {accountLoginCodeHeadingPrefix}{" "}
                        <span className="font-bold">{email.trim()}</span>
                    </p>
                    <input
                        ref={codeRef}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        placeholder="Code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className={INPUT}
                    />
                    <button type="submit" disabled={loading} className={SUBMIT}>
                        {loading ? "Signing in…" : accountLoginContinueLabel}
                    </button>
                    <p className="mt-[12px] text-center text-[12px] text-[color-mix(in_srgb,var(--nav-fg)_70%,transparent)]">
                        {accountLoginResendPrompt}{" "}
                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => {
                                setCode("");
                                setStage("email");
                            }}
                            className={clsx(
                                "font-semibold text-[var(--nav-fg-hover)] underline",
                                loading && "cursor-not-allowed opacity-60",
                            )}
                        >
                            {accountLoginResendLabel}
                        </button>
                    </p>
                </form>
            )}
        </div>
    );
}
