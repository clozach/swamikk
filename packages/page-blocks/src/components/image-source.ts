import type { Media } from "@courselit/common-models";

/**
 * Where a picture comes from — the ONE tagged union every block uses.
 *
 * A picture is a hand-typed URL (the staged assets live at same-origin
 * `/anahata/<file>`), an item picked from the media library, or a
 * placeholder: a description of the photo that has not arrived yet, rendered
 * as a waiting-for-asset well in the exact box the final image will occupy.
 * Exactly one arm is ever populated, so "url and media both set" and
 * "placeholder with a stray url" are unrepresentable.
 *
 * Alt text is deliberately not part of the source: each block keeps its alt
 * where it already lives (a wrapper, a sibling setting, inside the arm), and
 * `placeholderAlt` derives the well's accessible name in one place.
 */
export type ImageSource =
    | { kind: "url"; url: string }
    | { kind: "media"; media: Partial<Media> }
    | { kind: "placeholder"; description: string };

export type ImageSourceKind = ImageSource["kind"];
export type WaitingImageSource = Extract<ImageSource, { kind: "placeholder" }>;

export const urlSource = (url: string): ImageSource => ({ kind: "url", url });
export const mediaSource = (media: Partial<Media>): ImageSource => ({
    kind: "media",
    media,
});
export const placeholderSource = (description: string): ImageSource => ({
    kind: "placeholder",
    description,
});

/** The tag text every well carries. Also the fallback accessible name. */
export const WAITING_LABEL = "waiting for asset";

/**
 * The single reader. `undefined` when the source is absent, carries no usable
 * file, OR is a placeholder — callers branch on `isWaiting` for the latter.
 * Media reads `file` first, then `thumbnail`.
 */
export function resolveImageSrc(
    source?: ImageSource | null,
): string | undefined {
    if (!source) return undefined;
    const raw =
        source.kind === "url"
            ? source.url
            : source.kind === "media"
              ? source.media?.file || source.media?.thumbnail
              : undefined;
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return trimmed ? trimmed : undefined;
}

/** True when the source is a placeholder — the well should render. */
export function isWaiting(
    source?: ImageSource | null,
): source is WaitingImageSource {
    return (
        !!source &&
        source.kind === "placeholder" &&
        typeof source.description === "string"
    );
}

/**
 * "Does this well render anything at all?" — a resolvable src OR a
 * placeholder. Replaces every `src &&` gate in a block.
 */
export function hasWell(source?: ImageSource | null): boolean {
    return Boolean(resolveImageSrc(source)) || isWaiting(source);
}

/**
 * The description when the source is a placeholder and the block's own alt
 * is empty; otherwise the alt (empty string = decorative, as before).
 */
export function placeholderAlt(
    source: ImageSource | null | undefined,
    alt?: string | null,
): string {
    const own = typeof alt === "string" ? alt.trim() : "";
    if (own) return own;
    return isWaiting(source) ? source.description.trim() : "";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const looksLikeMedia = (value: Record<string, unknown>): boolean =>
    typeof value.mediaId === "string" ||
    typeof value.file === "string" ||
    typeof value.thumbnail === "string";

/**
 * Boundary parser for documents saved before the union, or hand-edited.
 * Accepts, in order:
 *   - a plain string             → `{ kind: "url", url }` (kept even when
 *                                   empty: "URL arm, nothing typed yet")
 *   - `{ kind: "url" | "media" | "placeholder", … }` → passthrough, payload
 *                                   coerced to the arm's shape
 *   - `{ url }`                  → url arm
 *   - `{ media }`                → media arm
 *   - a bare Media-ish object (`mediaId` / `file` / `thumbnail`) → media arm
 *   - anything else              → `undefined` (callers `?? fallback`)
 *
 * Paired legacy fields (`logoSrc` + `logoMedia`) are the caller's to fold —
 * see `fromUrlOrMedia`.
 */
export function normalizeImageSource(value: unknown): ImageSource | undefined {
    if (typeof value === "string") return urlSource(value);
    if (!isRecord(value)) return undefined;

    switch (value.kind) {
        case "url":
            return urlSource(typeof value.url === "string" ? value.url : "");
        case "media":
            return mediaSource(
                isRecord(value.media) ? (value.media as Partial<Media>) : {},
            );
        case "placeholder":
            return placeholderSource(
                typeof value.description === "string" ? value.description : "",
            );
    }

    if (typeof value.url === "string") return urlSource(value.url);
    if (isRecord(value.media)) {
        return mediaSource(value.media as Partial<Media>);
    }
    if (looksLikeMedia(value)) {
        return mediaSource(value as unknown as Partial<Media>);
    }
    return undefined;
}

/**
 * Folds a legacy `{ logoSrc, logoMedia }`-style pair into one source. A media
 * object with a usable file wins (the precedence the header's flag-bag
 * encoded in prose); then a non-empty url; then `undefined`.
 */
export function fromUrlOrMedia(
    url?: string | null,
    media?: Partial<Media> | null,
): ImageSource | undefined {
    if (media && resolveImageSrc(mediaSource(media))) return mediaSource(media);
    if (typeof url === "string" && url.trim()) return urlSource(url);
    return undefined;
}
