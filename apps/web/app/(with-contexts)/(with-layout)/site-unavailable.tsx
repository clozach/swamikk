import Link from "next/link";

/**
 * Branded fallback for when the site setup can't be loaded (backend outage).
 *
 * This renders in the failure paths where the storefront would otherwise
 * return `null` and paint a blank white screen. It is deliberately
 * theme-independent: the saved theme's CSS variables may not have been
 * emitted when the site setup fetch itself failed, so the cream ground, warm
 * text, and rust link are pinned to the Anahata palette directly rather than
 * to `bg-background` / `text-foreground` tokens that could resolve to the
 * bare shadcn defaults (a white page) in this exact situation.
 */
export function SiteUnavailable({
    siteName,
    minHeightClass = "min-h-screen",
}: {
    siteName?: string;
    minHeightClass?: string;
}) {
    return (
        <div
            className={`flex ${minHeightClass} flex-col items-center justify-center gap-4 bg-[#f7f4eb] px-4 py-16 text-center text-[#312110]`}
        >
            {siteName ? (
                <p className="text-2xl font-semibold">{siteName}</p>
            ) : null}
            <p className="max-w-prose text-base">
                We&apos;re having trouble loading the site — please refresh.
            </p>
            <Link
                href="/"
                className="text-base font-medium text-[#993300] underline underline-offset-4 hover:text-[#7a2900]"
            >
                Try again
            </Link>
        </div>
    );
}
