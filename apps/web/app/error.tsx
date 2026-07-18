"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Header1, Text1, Button } from "@courselit/page-primitives";
import {
    ERROR_PAGE_ACTION_RETRY,
    ERROR_PAGE_DESCRIPTION,
    ERROR_PAGE_TITLE,
    NOT_FOUND_ACTION_HOME,
} from "@ui-config/strings";

/**
 * Branded error boundary for anything thrown below the root layout.
 *
 * An error boundary has to be a client component, so unlike not-found.tsx it
 * cannot fetch the site's theme — and it sits above the context providers, so
 * it cannot read one either. It carries `courselit-theme` anyway: the root
 * layout has already emitted that rule set into <head>, so the site's own
 * colours apply here even though the theme object itself is out of reach.
 * Typography is deliberately left at the primitives' defaults rather than
 * pinned to any one site's fonts.
 */
export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="courselit-theme flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16 text-center">
            <Header1 className="text-foreground">{ERROR_PAGE_TITLE}</Header1>
            <div className="mt-4 max-w-prose">
                <Text1 className="text-muted-foreground">
                    {ERROR_PAGE_DESCRIPTION}
                </Text1>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <Button onClick={reset}>{ERROR_PAGE_ACTION_RETRY}</Button>
                <Link href="/">
                    <Button variant="secondary">{NOT_FOUND_ACTION_HOME}</Button>
                </Link>
            </div>
        </div>
    );
}
