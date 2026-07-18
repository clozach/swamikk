"use client";

import { useContext } from "react";
import { RefreshCw } from "lucide-react";
import { Subheader1, Text2, Button } from "@courselit/page-primitives";
import { ThemeContext } from "@components/contexts";

/**
 * Error state for a member's content surfaces (My Content, Feed).
 *
 * A backend failure here used to fall through to the empty state — telling a
 * paying member they "haven't enrolled in any products yet" when in fact their
 * content simply couldn't be fetched. This distinguishes the two: it names the
 * failure and offers a retry that re-runs the fetch, matching the storefront's
 * centred, box-free empty states in tone.
 */
export function MyContentErrorState({
    title,
    description,
    actionLabel = "Try again",
    onRetry,
}: {
    title: string;
    description?: string;
    actionLabel?: string;
    onRetry: () => void;
}) {
    const { theme } = useContext(ThemeContext);

    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <RefreshCw
                className="mb-4 h-12 w-12 text-muted-foreground"
                aria-hidden="true"
            />
            <Subheader1 theme={theme.theme}>{title}</Subheader1>
            {description ? (
                <div className="mt-2 max-w-prose">
                    <Text2 theme={theme.theme}>{description}</Text2>
                </div>
            ) : null}
            <div className="mt-6">
                <Button theme={theme.theme} onClick={onRetry}>
                    {actionLabel}
                </Button>
            </div>
        </div>
    );
}
