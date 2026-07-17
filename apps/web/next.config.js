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
