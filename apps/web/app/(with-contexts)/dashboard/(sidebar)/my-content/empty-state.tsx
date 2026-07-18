"use client";

import { useContext } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Subheader1, Text2, Button } from "@courselit/page-primitives";
import { ThemeContext } from "@components/contexts";

/**
 * "You haven't enrolled in any products yet" — a MEMBER's empty shelf.
 *
 * This deliberately does not reuse components/admin/empty-state. That one is
 * built for an admin staring at a list they are expected to fill: a dashed
 * placeholder box, muted fill, and a "create the missing thing" button. A
 * customer who has simply not bought anything yet is not looking at a hole in
 * their own work, and framing it as one makes the school's own pages read
 * like tooling. This matches the storefront's empty states instead — same
 * centred icon, same theme typography, no box — with the one thing the
 * storefront version has no need for: a way to go buy something.
 */
export function MyContentEmptyState({
    title,
    description,
    actionLabel,
    actionHref,
}: {
    title: string;
    description?: string;
    actionLabel: string;
    actionHref: string;
}) {
    const { theme } = useContext(ThemeContext);

    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="mb-4 h-12 w-12 text-muted-foreground" />
            <Subheader1 theme={theme.theme}>{title}</Subheader1>
            {description ? (
                <div className="mt-2 max-w-prose">
                    <Text2 theme={theme.theme}>{description}</Text2>
                </div>
            ) : null}
            <div className="mt-6">
                <Link href={actionHref}>
                    <Button theme={theme.theme}>{actionLabel}</Button>
                </Link>
            </div>
        </div>
    );
}
