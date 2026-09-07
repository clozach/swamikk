export const MEMBER_MIMIC_COOKIE = "courselit.member-mimic";
export const MEMBER_MIMIC_PATH_HEADER = "x-courselit-member-view-path";
export const MEMBER_MIMIC_DURATION_MS = 15 * 60_000;
// The cookie outlives permission: expiry stays visibly blocked until explicit Exit.
export const MEMBER_MIMIC_COOKIE_MAX_AGE = 24 * 60 * 60;
export const MEMBER_MIMIC_AUDIT_MS = 90 * 24 * 60 * 60_000;

export function isMemberMimicPath(path: string): boolean {
    let pathname: string;
    try {
        pathname = decodeURIComponent(path.split("?")[0]).replace(/\/+$/, "");
    } catch {
        return false;
    }
    if (/[\x00-\x20\\]/.test(pathname)) return false;
    return (
        pathname === "/dashboard/profile" ||
        pathname === "/dashboard/membership" ||
        pathname === "/dashboard/refunds" ||
        /^\/dashboard\/receipts\/[A-Za-z0-9_-]{1,128}$/.test(pathname) ||
        pathname === "/dashboard/my-content" ||
        pathname === "/dashboard/my-content/products" ||
        (/^\/course\/[^/]+\/[^/]+(?:\/[^/]+)?\/?$/.test(pathname) &&
            !pathname.endsWith("/discussions"))
    );
}

export function safeMimicReturnTo(value?: string): string {
    if (!value || value.length > 1024 || /[\x00-\x20#\\]/.test(value))
        return "/dashboard/users";
    try {
        const url = new URL(value, "https://member-mimic.invalid");
        if (
            url.origin === "https://member-mimic.invalid" &&
            (url.pathname === "/dashboard/users" ||
                url.pathname === "/dashboard/subscribers" ||
                url.pathname === "/dashboard/transactions" ||
                /^\/dashboard\/cohorts\/[A-Za-z0-9_-]{1,128}$/.test(
                    url.pathname,
                ) ||
                /^\/dashboard\/product\/[A-Za-z0-9_-]{1,128}\/(customers|transactions)$/.test(
                    url.pathname,
                ))
        )
            return url.pathname + url.search;
    } catch {
        /* Invalid destinations fall back to the member list. */
    }
    return "/dashboard/users";
}

export function hasMemberMimicCookie(headers: Headers): boolean {
    return /(?:^|;\s*)courselit\.member-mimic=/.test(
        headers.get("cookie") || "",
    );
}

export function readMemberMimicToken(headers: Headers): string | undefined {
    const value = headers
        .get("cookie")
        ?.match(/(?:^|;\s*)courselit\.member-mimic=([^;]*)/)?.[1];
    return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
