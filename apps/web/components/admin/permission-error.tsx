import Link from "next/link";
import { Button } from "@components/ui/button";

/**
 * The shatkona — Anahata's own heart-chakra yantra (two interlaced
 * triangles), used in place of a generic warning icon so an access-denied
 * moment still reads as belonging to the site. Rust/saffron are hardcoded
 * hex here, matching the existing convention for this exact brand accent
 * (see globals.css's `.anahata-private-blue :is(h1,h2,h3)` override).
 */
function ShatkonaIcon() {
    return (
        <svg
            width="44"
            height="44"
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden="true"
            className="mx-auto mb-4"
        >
            <polygon
                points="24,6 8.41,33 39.59,33"
                fill="none"
                stroke="#993300"
                strokeWidth="1.7"
                strokeLinejoin="round"
            />
            <polygon
                points="24,42 8.41,15 39.59,15"
                fill="none"
                stroke="#993300"
                strokeWidth="1.7"
                strokeLinejoin="round"
            />
            <circle cx="24" cy="24" r="3.1" fill="#ff9900" />
        </svg>
    );
}

/**
 * Shown in place of a page's content when the signed-in user lacks the
 * required permission. Stays inside the dashboard shell (the header above
 * this — logo/breadcrumbs/account menu — remains visible and navigable), so
 * "Breathe" is a courtesy shortcut home, not the only way out.
 */
export default function PermissionError() {
    return (
        <div className="flex items-center justify-center p-4">
            <div className="text-center max-w-md w-full py-10">
                <ShatkonaIcon />
                <div className="flex items-center justify-center gap-2 mb-3">
                    <h1 className="text-2xl font-medium">Off the path</h1>
                    <span
                        aria-hidden="true"
                        className="font-light leading-none"
                        style={{
                            writingMode: "vertical-rl",
                            letterSpacing: "0.05em",
                            color: "#993300",
                        }}
                    >
                        403
                    </span>
                </div>
                <p className="text-muted-foreground mb-6">
                    This area is kept for the site&apos;s caretakers. Let&apos;s
                    guide you back home.
                </p>
                <Button asChild>
                    <Link href="/">Breathe</Link>
                </Button>
            </div>
        </div>
    );
}
