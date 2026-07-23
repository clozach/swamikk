import React from "react";

/**
 * The network mark shown inside the overlay button.
 *
 * Known networks get a bundled monochrome SVG (simple-icons path) with
 * `fill="currentColor"`, so the mark automatically takes the button's font
 * colour — which is exactly the "logo tinted the same colour as the button
 * font" the brief asked for. Unknown domains fall back to that site's
 * `/favicon.ico`; a raster favicon CANNOT be tinted to the font colour (hence
 * the bundled SVGs for the networks we care about). Adding a future network is
 * a one-entry change to `GLYPHS`.
 */

/** Normalize "https://www.Instagram.com/…" → "instagram.com". */
export function normalizeNetworkDomain(domain: string): string {
    return (domain || "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0];
}

/** Human network name for the button label; falls back to the bare domain. */
export function networkLabel(domain: string): string {
    const d = normalizeNetworkDomain(domain);
    switch (d) {
        case "instagram.com":
            return "Instagram";
        case "facebook.com":
            return "Facebook";
        default:
            return d;
    }
}

// simple-icons 24×24 path data.
const GLYPHS: Record<string, string> = {
    "instagram.com":
        "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3808 2.1266-.2954.7638-.4956 1.6365-.552 2.9134-.0564 1.2769-.0689 1.6858-.0626 4.9411.0062 3.2554.0206 3.6621.0825 4.9412.061 1.2765.264 2.1482.5635 2.9105.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9127.552 1.2766.056 1.6859.069 4.9408.0627 3.2549-.0062 3.6603-.0207 4.9382-.0814 1.2781-.0607 2.1466-.2652 2.9092-.5633.7889-.3086 1.4577-.72 2.1228-1.3881.6652-.668 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.945-.0063-3.2551-.021-3.6603-.0817-4.9377-.0607-1.2773-.264-2.1486-.5633-2.9111-.3084-.7889-.72-1.4573-1.3877-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9248.0645 15.6479.0093 15.2396-.005 11.9924.0014 8.7452.0076 8.3389.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.4232-.1651 1.0577-.3614 2.227-.4171 1.2655-.0596 1.6447-.0719 4.848-.0789 3.2033-.007 3.5835.0052 4.8495.0606 1.169.0509 1.8053.2445 2.228.408.5608.216.96.4762 1.3816.895.4217.4188.6816.8168.9005 1.3783.1653.4218.3617 1.0573.4169 2.2263.0596 1.2655.0726 1.6448.0776 4.848.005 3.2033-.0056 3.5834-.061 4.848-.0508 1.169-.2445 1.8053-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2265.4174-1.2656.0595-1.6448.0718-4.8495.0788-3.2047.007-3.5825-.006-4.848-.0604M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0033a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0033",
    "facebook.com":
        "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
};

export function NetworkGlyph({
    domain,
    className,
}: {
    domain: string;
    className?: string;
}): JSX.Element {
    const d = normalizeNetworkDomain(domain);
    const path = GLYPHS[d];

    if (path) {
        return (
            <svg
                viewBox="0 0 24 24"
                width="1em"
                height="1em"
                fill="currentColor"
                aria-hidden="true"
                focusable="false"
                className={className}
            >
                <path d={path} />
            </svg>
        );
    }

    // Unknown network: raster favicon (cannot be tinted to the font colour).
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={`https://${d}/favicon.ico`}
            alt=""
            aria-hidden="true"
            width={16}
            height={16}
            className={className}
            style={{ width: "1em", height: "1em", objectFit: "contain" }}
        />
    );
}
