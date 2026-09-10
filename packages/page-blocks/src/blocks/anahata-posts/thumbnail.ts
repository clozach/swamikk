import { normalizeImageSource } from "../../components/image-source";
import type { PostImage } from "./settings";

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Boundary parser: either stored shape → `PostImage`.
 *
 *   - `{ source, alt }`            (current) → passthrough, `source` re-normalised
 *   - `{ kind, …, alt }`           (legacy flat url / media / placeholder) →
 *                                   the arm becomes `source`, the alt comes off the top
 *   - `{ url }` / `{ media }` / a bare Media-ish object → likewise, via the shared parser
 *   - anything else                → `{ alt: "" }` (no picture, no well)
 */
export function normalizePostThumbnail(value: unknown): PostImage {
    if (!isRecord(value)) return { alt: "" };
    const alt = typeof value.alt === "string" ? value.alt : "";
    const source =
        "source" in value
            ? normalizeImageSource(value.source)
            : normalizeImageSource(value);
    return source ? { source, alt } : { alt };
}
