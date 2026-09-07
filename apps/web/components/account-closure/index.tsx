"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useMemberMimic } from "@/components/member-mimic/context";
import { authClient } from "@/lib/auth-client";
import type { AccountClosureReview } from "@/services/account-closure/types";

type View =
    | { kind: "closed" }
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "review"; review: AccountClosureReview }
    | { kind: "error"; message: string }
    | { kind: "erasing" };
async function request(method: "GET" | "DELETE" | "PATCH", payload?: unknown) {
    const response = await fetch("/api/account-closure", {
        method,
        credentials: "same-origin",
        cache: "no-store",
        ...(payload
            ? {
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
              }
            : {}),
    });
    const result = await response.json();
    if (!response.ok)
        throw new Error(
            result.error?.message ||
                "Account closure is unavailable. Contact support before trying again.",
        );
    return result;
}
export default function AccountClosure({
    userId,
    onClosed,
}: {
    userId: string;
    onClosed?: () => void;
}) {
    const mimic = useMemberMimic();
    const [view, setView] = useState<View>({ kind: "idle" });
    const [confirmation, setConfirmation] = useState("");
    if (mimic.kind !== "inactive")
        return (
            <p className="text-sm text-muted-foreground">
                Account closure is unavailable in read-only Member Mimic.
            </p>
        );
    const review = async () => {
        setView({ kind: "loading" });
        try {
            setView({ kind: "review", review: await request("GET") });
        } catch (error) {
            setView({
                kind: "error",
                message:
                    error instanceof Error
                        ? error.message
                        : "Account closure is unavailable.",
            });
        }
    };
    const signInAgain = async () => {
        setView({ kind: "loading" });
        try {
            const { error } = await authClient.signOut();
            if (error)
                throw new Error(
                    error.message || "Sign-out failed. Please try again.",
                );
            window.location.assign(
                "/login?redirect=%2Fdashboard%2Fprofile%23account-closure",
            );
        } catch (error) {
            setView({
                kind: "error",
                message:
                    error instanceof Error
                        ? error.message
                        : "Sign-out failed. Please try again.",
            });
        }
    };
    const close = async (reviewHash: string) => {
        setView({ kind: "erasing" });
        try {
            await request("DELETE", { reviewHash, confirmation });
            try {
                Object.keys(sessionStorage)
                    .filter(
                        (key) =>
                            key.startsWith(`kk-comment:${userId}:`) ||
                            key.startsWith(`page-edit:${userId}:`),
                    )
                    .forEach((key) => sessionStorage.removeItem(key));
            } catch {
                /* Storage may be disabled. */
            }
            setView({ kind: "closed" });
            onClosed?.();
            try {
                await authClient.signOut();
            } catch {
                /* The server account is already closed. */
            }
        } catch (error) {
            setView({
                kind: "error",
                message:
                    error instanceof Error
                        ? error.message
                        : "Check closure with support before trying again.",
            });
        }
    };
    const keep = async () => {
        setView({ kind: "loading" });
        try {
            await request("PATCH", { action: "keep" });
            setView({ kind: "idle" });
            setConfirmation("");
        } catch (error) {
            setView({
                kind: "error",
                message:
                    error instanceof Error
                        ? error.message
                        : "Check closure with support.",
            });
        }
    };
    return (
        <section
            id="account-closure"
            className="grid gap-5 rounded-xl border p-6"
        >
            <h2 className="text-lg font-semibold">Delete my account</h2>
            {view.kind === "closed" ? (
                <>
                    <p>
                        Your account is closed. Financial and recovery records
                        are retained as described in your review.
                    </p>
                    <Link href="/" className="underline">
                        Return home
                    </Link>
                </>
            ) : (
                <>
                    <p className="text-sm text-muted-foreground">
                        Review your membership and private data before
                        permanently closing your account.
                    </p>
                    {(view.kind === "idle" || view.kind === "error") && (
                        <Button
                            variant="outline"
                            className="w-fit"
                            onClick={review}
                        >
                            Review account closure
                        </Button>
                    )}
                    {view.kind === "error" && (
                        <p role="alert">
                            {view.message}{" "}
                            <Link className="underline" href="/p/contact">
                                Contact support
                            </Link>
                        </p>
                    )}
                    {(view.kind === "loading" || view.kind === "erasing") && (
                        <p role="status">
                            {view.kind === "erasing"
                                ? "Closing your account…"
                                : "Checking your account…"}
                        </p>
                    )}
                    {view.kind === "review" && (
                        <>
                            <ul className="list-disc space-y-3 pl-5 text-sm">
                                <li>
                                    Your sign-in access, private contact choices
                                    and optional support photo will be removed.
                                    Your comments will be removed or redacted,
                                    and unsubmitted refund drafts will be
                                    erased.
                                </li>
                                <li>
                                    Your saved content access ends, including
                                    content retained after membership
                                    cancellation. Account closure does not issue
                                    a refund or cancel a subscription.
                                </li>
                                <li>
                                    Receipts, submitted refund requests, payment
                                    references and records needed for financial
                                    or content recovery will be retained. This
                                    does not erase database backups; contact
                                    support about retained records. Messages
                                    already queued or sent may still reach you.
                                </li>
                            </ul>
                            {view.review.blockers.map((blocker) => (
                                <p key={blocker.kind} role="alert">
                                    {blocker.message}{" "}
                                    <Link
                                        className="underline"
                                        href={blocker.href}
                                    >
                                        Review with help
                                    </Link>
                                </p>
                            ))}
                            {view.review.pendingWrites > 0 && (
                                <p role="status">
                                    A change is still finishing. Check closure
                                    again shortly; contact support if it stays
                                    pending.
                                </p>
                            )}
                            {!view.review.recentIdentity ? (
                                <>
                                    <p>
                                        Confirm your identity by signing in
                                        again. This uses the site’s normal
                                        sign-in method.
                                    </p>
                                    <Button
                                        className="w-fit"
                                        onClick={signInAgain}
                                    >
                                        Sign in again
                                    </Button>
                                </>
                            ) : (
                                view.review.blockers.length === 0 && (
                                    <>
                                        <label className="grid gap-2 text-sm">
                                            Type CLOSE to permanently close this
                                            account
                                            <input
                                                className="max-w-xs rounded border bg-background p-3"
                                                autoComplete="off"
                                                value={confirmation}
                                                onChange={(event) =>
                                                    setConfirmation(
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                        </label>
                                        <Button
                                            variant="destructive"
                                            className="w-fit"
                                            disabled={confirmation !== "CLOSE"}
                                            onClick={() =>
                                                close(view.review.reviewHash)
                                            }
                                        >
                                            Permanently close my account
                                        </Button>
                                    </>
                                )
                            )}
                            <Button
                                variant="ghost"
                                className="w-fit"
                                onClick={keep}
                            >
                                Keep my account
                            </Button>
                        </>
                    )}
                </>
            )}
            <p className="text-sm text-muted-foreground">
                For help with retained records,{" "}
                <Link href="/p/contact" className="underline">
                    contact KK and the support team
                </Link>
                .
            </p>
        </section>
    );
}
