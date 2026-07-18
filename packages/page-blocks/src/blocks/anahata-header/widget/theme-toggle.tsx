import React, { useEffect, useState } from "react";

/* Icons are inline SVG rather than lucide-react, matching ./chevron.tsx —
   page-blocks does not declare lucide as a dependency, and two 16px glyphs
   are not worth adding one for. `currentColor` lets them inherit the nav's
   own rest/hover/active colours, so they stay AA without a second palette. */
function SunIcon() {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            className="shrink-0"
        >
            <circle
                cx="8"
                cy="8"
                r="3.25"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            {[
                [8, 0.75, 8, 2.5],
                [8, 13.5, 8, 15.25],
                [0.75, 8, 2.5, 8],
                [13.5, 8, 15.25, 8],
                [3.1, 3.1, 4.3, 4.3],
                [11.7, 11.7, 12.9, 12.9],
                [3.1, 12.9, 4.3, 11.7],
                [11.7, 4.3, 12.9, 3.1],
            ].map(([x1, y1, x2, y2], i) => (
                <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                />
            ))}
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            className="shrink-0"
        >
            <path
                d="M13.2 9.6A5.7 5.7 0 0 1 6.4 2.8a5.75 5.75 0 1 0 6.8 6.8z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/**
 * Light/dark switch, sitting at the end of the nav.
 *
 * `nextTheme` is undefined during SSR and on the first client render — the
 * theme is only known after next-themes hydrates. Rendering an icon before
 * then would guess wrong half the time and flip visibly on hydration, so the
 * glyph is withheld until mounted while the button keeps its size, leaving no
 * layout shift. Same reasoning as the stock header block.
 */
export default function ThemeToggle({
    nextTheme,
    toggleTheme,
    label,
    className,
}: {
    nextTheme: string | undefined;
    toggleTheme: () => void;
    label: string;
    className: string;
}) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const isDark = nextTheme === "dark";

    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label={label}
            // The control is a toggle whose pressed state IS "dark mode on",
            // which is what a screen reader should announce rather than the
            // icon currently showing.
            aria-pressed={mounted ? isDark : undefined}
            title={label}
            className={className}
        >
            {mounted ? isDark ? <SunIcon /> : <MoonIcon /> : null}
        </button>
    );
}
