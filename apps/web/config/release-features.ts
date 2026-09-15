// CourseLit Communities is outside the SwamiKK release. Keep stored records and
// settlement/cleanup handlers intact; do not expose discovery, joining or authoring.
export const COMMUNITIES_ENABLED: boolean = false;

export function isCommunityReleasePath(pathname: string, type?: string | null) {
    let path = pathname;
    try {
        path = decodeURIComponent(pathname);
    } catch {
        /* Match the original path. */
    }
    return (
        /^\/(?:communities|community|dashboard\/(?:communities|community|my-content\/feed))(?:\/|$)/.test(
            path,
        ) ||
        (path.replace(/\/$/, "") === "/checkout" &&
            type?.toLowerCase() === "community")
    );
}
