import { mediaPreviewUrl } from "../media-preview-url";

const THUMB =
    "http://localhost:9000/courselit-media-public/p/2MkMMrM0XyfRuUws39MtTfwfrEHceTSukeTUl5xO/thumb.webp";
const MAIN = (ext: string) =>
    `http://localhost:9000/courselit-media-public/p/2MkMMrM0XyfRuUws39MtTfwfrEHceTSukeTUl5xO/main.${ext}`;

describe("mediaPreviewUrl", () => {
    it("swaps the distorted thumbnail for the original for each image type", () => {
        expect(mediaPreviewUrl("image/jpeg", THUMB)).toBe(MAIN("jpg"));
        expect(mediaPreviewUrl("image/png", THUMB)).toBe(MAIN("png"));
        expect(mediaPreviewUrl("image/webp", THUMB)).toBe(MAIN("webp"));
        expect(mediaPreviewUrl("image/gif", THUMB)).toBe(MAIN("gif"));
    });

    it("only rewrites the final path segment, not an earlier match", () => {
        const nested = "http://cdn.test/thumb.webp-bucket/p/abc/thumb.webp";
        expect(mediaPreviewUrl("image/jpeg", nested)).toBe(
            "http://cdn.test/thumb.webp-bucket/p/abc/main.jpg",
        );
    });

    it("leaves video posters to the thumbnail (main.mp4 is not an image)", () => {
        expect(mediaPreviewUrl("video/mp4", THUMB)).toBeNull();
    });

    it("has nothing to swap for pdf/audio", () => {
        expect(mediaPreviewUrl("application/pdf", "")).toBeNull();
        expect(mediaPreviewUrl("audio/mpeg", undefined)).toBeNull();
    });

    it("does not touch svg (Next won't optimize it) or unknown image types", () => {
        expect(mediaPreviewUrl("image/svg+xml", THUMB)).toBeNull();
        expect(mediaPreviewUrl("image/avif", THUMB)).toBeNull();
    });

    it("falls back (returns null) for a signed/non-standard thumbnail URL", () => {
        // Private media serve signed thumbnails with a query string; the anchor
        // won't match, so we keep the thumbnail rather than guess a broken URL.
        expect(
            mediaPreviewUrl("image/jpeg", `${THUMB}?token=abc123`),
        ).toBeNull();
        expect(mediaPreviewUrl("image/jpeg", MAIN("jpg"))).toBeNull();
    });

    it("returns null when inputs are missing", () => {
        expect(mediaPreviewUrl(undefined, THUMB)).toBeNull();
        expect(mediaPreviewUrl("image/jpeg", undefined)).toBeNull();
    });
});
