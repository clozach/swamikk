import React from "react";
import clsx from "clsx";

/* Shared between the desktop flyout trigger and the mobile drawer's
   expand/collapse control. */
export default function Chevron({
    direction,
}: {
    direction: "right" | "down";
}) {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={clsx(
                "shrink-0 transition-transform duration-200 ease-out",
                direction === "down" && "rotate-90",
            )}
        >
            <path
                d="M3 1l4 4-4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
