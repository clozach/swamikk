import sharp from "sharp";
import { requireCondition } from "@/services/content-changes/errors";

/** Decode trusted formats, bound memory and discard metadata before storing. */
export async function privatePhotoJpeg(data: string): Promise<Buffer> {
    requireCondition(
        /^[A-Za-z0-9+/]+={0,2}$/.test(data),
        "bad_request",
        "Choose a JPEG, PNG or WebP photo.",
    );
    const bytes = Buffer.from(data, "base64");
    requireCondition(
        bytes.length <= 2 * 1024 * 1024,
        "too_large",
        "Choose a photo smaller than 2 MB.",
        413,
    );
    try {
        const image = sharp(bytes, {
            limitInputPixels: 16_000_000,
            animated: false,
            failOn: "warning",
        });
        const metadata = await image.metadata();
        requireCondition(
            ["jpeg", "png", "webp"].includes(metadata.format || "") &&
                (metadata.pages || 1) === 1,
            "bad_request",
            "Choose a still JPEG, PNG or WebP photo.",
        );
        // Sharp drops EXIF/GPS and other metadata by default.
        return await image
            .rotate()
            .resize(512, 512, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
    } catch {
        requireCondition(
            false,
            "bad_request",
            "This photo could not be read. Choose a still JPEG, PNG or WebP photo.",
        );
        throw new Error("unreachable");
    }
}
