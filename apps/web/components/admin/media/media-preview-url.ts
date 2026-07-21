// MediaLit force-resizes every thumbnail to a fixed 853x480 (16:9), stretching
// the source to fill regardless of its real aspect ratio — a portrait 1054x1536
// gets the same 16:9 thumb. So thumb.webp is distortion-baked and no CSS
// object-fit can recover it. For image media the undistorted original lives
// beside the thumbnail at .../p/{id}/main.<ext> (confirmed against MediaLit's
// get() response), so the card can render that instead and get a proportional,
// cover-cropped image. Next's optimizer downscales it, so this is not a
// full-resolution download.
//
// Returns null when there is no safe original to swap in — non-image media
// (video poster / pdf / audio), an image type we don't have a confirmed
// extension for, or a signed/non-standard thumbnail URL (private media). In
// every null case the caller falls back to the thumbnail, i.e. today's behavior.

// mimeType -> the extension MediaLit stores the original under (main.<ext>).
// Verified live via get() for the three raster types the library holds; gif is
// the safe fourth. svg is deliberately absent — Next refuses to optimize SVGs
// by default, so those fall back to the thumbnail.
const IMAGE_EXTENSION: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
};

export function mediaPreviewUrl(
    mimeType: string | undefined,
    thumbnail: string | undefined,
): string | null {
    if (!mimeType || !thumbnail) {
        return null;
    }
    const extension = IMAGE_EXTENSION[mimeType];
    if (!extension) {
        return null;
    }
    // Only the standard public thumbnail path is safe to rewrite; a signed or
    // otherwise non-standard URL (query string, different suffix) is left alone.
    if (!thumbnail.endsWith("/thumb.webp")) {
        return null;
    }
    return thumbnail.replace(/\/thumb\.webp$/, `/main.${extension}`);
}
