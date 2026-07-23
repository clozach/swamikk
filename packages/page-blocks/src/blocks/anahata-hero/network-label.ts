/**
 * Human network name for the hero photo credit ("Photo from {label}").
 * Falls back to the bare domain for networks we don't have a friendly name for.
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
