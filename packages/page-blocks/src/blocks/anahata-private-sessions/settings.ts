import { Media, WidgetDefaultSettings } from "@courselit/common-models";

/**
 * Where an image comes from.
 *
 * The Anahata assets are staged as same-origin files under `/anahata/…`, which
 * the medialit-backed `MediaSelector` cannot represent. Rather than carrying a
 * nullable `url` alongside a nullable `media` (a flag-bag whose combinations
 * include two illegal states), the source is a tagged union: exactly one shape
 * is ever populated, and `resolveImageSource` is the single reader.
 */
export type ImageSource =
    | { kind: "url"; url: string }
    | { kind: "media"; media: Media };

/**
 * The single reader for an `ImageSource`. Returns `undefined` when the source
 * is absent or carries no usable file, so callers never branch on the tag.
 */
export function resolveImageSource(
    source: ImageSource | undefined,
): string | undefined {
    if (!source) {
        return undefined;
    }
    const url =
        source.kind === "url" ? source.url : source.media?.file || undefined;
    return url && url.trim() ? url.trim() : undefined;
}

/** One list item in the callout. `id` is stable across drags/edits. */
export interface Bullet {
    id: string;
    text: string;
}

/** Which side the photograph sits on at >= 768px. Below that it always stacks first. */
export type PhotoPosition = "left" | "right";

export default interface Settings extends WidgetDefaultSettings {
    /** Portrait beside the copy. Default: /anahata/swami-kk-bio.jpg */
    photo?: ImageSource;
    /** Alt text for the portrait. Empty string marks it decorative. */
    photoAlt?: string;
    /** Intrinsic pixel size of the portrait, used to reserve space (CLS). */
    photoWidth?: number;
    photoHeight?: number;

    /** Ornament pinned to the bottom-right of the copy panel. */
    decorImage?: ImageSource;
    showDecorImage?: boolean;

    /** The rust lead line (an <h4> on the source site). */
    lead?: string;
    /** The verbatim bullet list. */
    bullets?: Bullet[];

    /** Call to action. */
    buttonCaption?: string;
    buttonAction?: string;
    buttonOpensInNewTab?: boolean;

    /** Palette overrides. Defaults are the Anahata design tokens. */
    panelColor?: string;
    leadColor?: string;
    textColor?: string;
    buttonColor?: string;
    buttonHoverColor?: string;
    buttonTextColor?: string;
    /**
     * Text colour once the background has moved to `buttonHoverColor`
     * (hover AND active/pressed). Separate from `buttonTextColor` because
     * one text colour cannot pass AA against both a saffron rest ground and
     * a rust hover ground at once — see defaults.ts for the measured ratios.
     */
    buttonHoverTextColor?: string;

    photoPosition?: PhotoPosition;
    cssId?: string;
}
