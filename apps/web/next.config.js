/** @type {import('next').NextConfig} */

const { version } = require("./package.json");

// next/image only optimizes remote images whose origin is allowlisted.
// Media is served via the MediaLit server, so extend the allowlist from
// MEDIALIT_SERVER when it points at a plain-HTTP or private host
// (self-hosted and dev setups); HTTPS origins are already covered by the
// wildcard pattern. Note: with `output: "standalone"`, this file is
// evaluated at build time, so MEDIALIT_SERVER must be present during the
// build for this to take effect (see services/app/Dockerfile).
function getImagesConfig() {
    const images = {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "**",
            },
        ],
    };

    if (!process.env.MEDIALIT_SERVER) {
        return images;
    }

    let mediaServer;
    try {
        mediaServer = new URL(process.env.MEDIALIT_SERVER);
    } catch (err) {
        return images;
    }

    if (mediaServer.protocol === "http:") {
        // No port on purpose: sibling services on the media host (e.g. a
        // local S3 serving the stored files) are covered as well.
        images.remotePatterns.push({
            protocol: "http",
            hostname: mediaServer.hostname,
        });
    }

    if (isPrivateHostname(mediaServer.hostname)) {
        // The optimizer refuses upstreams that resolve to private IPs
        // (SSRF hardening). When the operator explicitly points
        // MEDIALIT_SERVER at a local/private host, media lives there by
        // design, so opt out.
        images.dangerouslyAllowLocalIP = true;
    }

    return images;
}

function isPrivateHostname(hostname) {
    return (
        !hostname.includes(".") || // bare names (localhost, Docker service names) are never public DNS
        hostname.endsWith(".localhost") ||
        /^127\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
}

const nextConfig = {
    output: "standalone",
    env: {
        version,
    },
    reactStrictMode: false,
    typescript: {},
    images: getImagesConfig(),
    // Safari fix (2026-07-21): Next serves /public static files with
    // `Cache-Control: public, max-age=0`, so the browser revalidates them over
    // the network on EVERY view. Safari 18+/26.x has a keep-alive connection-
    // reuse bug (Apple Dev Forums thread 796906) that intermittently drops such
    // revalidations ("the network connection was lost") without retrying — so
    // the constantly-revalidated brand images (the header logo + the /anahata/*
    // replica media) render broken now and then, while the /_next/image
    // thumbnails (max-age=14400, served from cache with no per-view network)
    // never do. Give these static brand assets a real freshness lifetime with
    // stale-while-revalidate: within the hour Safari serves them from cache with
    // NO network request (removing the per-view revalidation that triggers the
    // bug); after that, SWR serves the cached bytes INSTANTLY while refreshing
    // in the background, so even a failed background revalidation never shows a
    // blank frame. Deliberately NOT `immutable`: these files are edited/
    // re-swapped in place at the same path (esp. the bind-mounted /anahata/*
    // edit loop), and immutable would pin stale bytes in Safari for up to a
    // year; SWR lets a same-filename swap propagate within ~1h (hard-refresh to
    // see it sooner). /public files aren't content-hash fingerprinted, so a
    // headers() rule is the supported way to set their caching.
    async headers() {
        const brandCache = [
            {
                key: "Cache-Control",
                value: "public, max-age=3600, stale-while-revalidate=86400",
            },
        ];
        // Covers EVERY static image served from /public (2026-07-21 sweep):
        // <img> src AND CSS background-image alike — all get max-age=0 from
        // Next's static handler, so all are exposed to the same drop.
        return [
            // Brand + replica media: storefront hero (wordmark + hp-hero-bg),
            // section backgrounds, gatherings, posts, bio, footer.
            { source: "/anahata/:path*", headers: brandCache },
            // Editorial-resilience block backgrounds; design-exploration
            // comparators — both served straight from /public.
            { source: "/editorial/:path*", headers: brandCache },
            { source: "/easter-eggs/:path*", headers: brandCache },
            // Root-level brand images.
            { source: "/swami-kk-logo.png", headers: brandCache },
            { source: "/swami-signature.png", headers: brandCache },
            { source: "/anahata-logo-2021.png", headers: brandCache },
            { source: "/anahata-emblem-64.png", headers: brandCache },
            { source: "/placeholder-image.svg", headers: brandCache },
            // Upstream CourseLit fallback art (shown when a record has no
            // image) + the fallback favicon.
            { source: "/courselit_backdrop.webp", headers: brandCache },
            { source: "/courselit_backdrop_square.webp", headers: brandCache },
            { source: "/default-favicon.ico", headers: brandCache },
        ];
    },
    transpilePackages: [
        "@courselit/page-blocks",
        "@courselit/components-library",
    ],
    serverExternalPackages: [
        "pug",
        "liquidjs",
        "mongoose",
        "mongodb",
        "jsonwebtoken",
    ],
    experimental: {},
};

module.exports = nextConfig;
