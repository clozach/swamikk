"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header1, Text1, Button } from "@courselit/page-primitives";
import type { ThemeStyle } from "@courselit/page-models";
import {
    NOT_FOUND_ACTION_HOME,
    NOT_FOUND_ACTION_PRODUCTS,
    STATUS_REDIRECT_NOTICE_PREFIX,
} from "@ui-config/strings";

/**
 * The one full-screen "you've hit a dead end" layout, extracted from the 404
 * page so unmatched routes AND in-app auth failures render identically. The
 * status code sits rotated beside the title (a fat mark closing the sentence);
 * an optional countdown quietly returns the visitor to safety.
 *
 * Presentational + serializable-props only, so a server component (the 404
 * route) and a client component (a dashboard permission gate) can both render
 * it. The theme is passed in because this can render outside the context
 * providers (the 404 route does).
 */

function CountdownRedirect({
    seconds,
    to,
    theme,
}: {
    seconds: number;
    to: string;
    theme?: ThemeStyle;
}) {
    const router = useRouter();
    const [remaining, setRemaining] = useState(seconds);

    useEffect(() => {
        const tick = setInterval(() => {
            setRemaining((n) => Math.max(0, n - 1));
        }, 1000);
        const jump = setTimeout(() => router.push(to), seconds * 1000);
        return () => {
            clearInterval(tick);
            clearTimeout(jump);
        };
    }, [router, seconds, to]);

    return (
        <Text1 theme={theme} className="mt-6 text-sm text-muted-foreground">
            {STATUS_REDIRECT_NOTICE_PREFIX} {remaining}s…
        </Text1>
    );
}

export interface StatusScreenProps {
    /** Status code shown rotated beside the title, e.g. "404" or "403". */
    code: string;
    title: string;
    description: string;
    /** Page-primitives theme; may be absent when no theme is resolvable. */
    theme?: ThemeStyle;
    /** Optional site logo (links home). */
    logo?: string;
    siteTitle?: string;
    /** When set, auto-redirect here after `redirectSeconds`. */
    redirectTo?: string;
    redirectSeconds?: number;
    /** Show the secondary "Browse products" action (404 route uses it). */
    showProductsAction?: boolean;
}

export default function StatusScreen({
    code,
    title,
    description,
    theme,
    logo,
    siteTitle = "",
    redirectTo,
    redirectSeconds = 5,
    showProductsAction = false,
}: StatusScreenProps) {
    return (
        <div className="courselit-theme flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16 text-center">
            {logo ? (
                <Link href="/" className="mb-10 inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={logo}
                        alt={siteTitle}
                        className="mx-auto h-auto max-h-20 w-auto max-w-[280px] object-contain"
                    />
                </Link>
            ) : null}
            <Header1
                theme={theme}
                className="flex flex-wrap items-center justify-center gap-x-4 text-foreground"
            >
                {title}
                {/* The status code, rotated 90° so it reads as a fat mark
                    closing the sentence rather than a second heading. */}
                <span
                    aria-hidden="true"
                    className="leading-none text-secondary"
                    style={{
                        writingMode: "vertical-rl",
                        fontFamily: "var(--font-open-sans), sans-serif",
                        fontWeight: 300,
                        letterSpacing: "0.05em",
                    }}
                >
                    {code}
                </span>
            </Header1>
            <div className="mt-4 max-w-prose">
                <Text1 theme={theme} className="text-muted-foreground">
                    {description}
                </Text1>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <Link href="/">
                    <Button theme={theme}>{NOT_FOUND_ACTION_HOME}</Button>
                </Link>
                {showProductsAction ? (
                    <Link href="/products">
                        <Button theme={theme} variant="secondary">
                            {NOT_FOUND_ACTION_PRODUCTS}
                        </Button>
                    </Link>
                ) : null}
            </div>
            {redirectTo ? (
                <CountdownRedirect
                    seconds={redirectSeconds}
                    to={redirectTo}
                    theme={theme}
                />
            ) : null}
        </div>
    );
}
