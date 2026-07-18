import type { Media, WidgetDefaultSettings } from "@courselit/common-models";

/**
 * Where a post's 150x150 thumbnail comes from.
 *
 * The Anahata defaults are static files staged under `apps/web/public/anahata/`,
 * which are plain same-origin URLs and have no Medialit `Media` record. Karuna
 * must also be able to swap in an image uploaded through the media library.
 *
 * Those are two genuinely different shapes, so they are a tagged union rather
 * than a pair of optional fields: "a url AND a media object" and "neither" are
 * both unrepresentable.
 */
export type PostThumbnail =
    | { kind: "url"; url: string; alt?: string }
    | { kind: "media"; media: Partial<Media>; alt?: string };

export interface Post {
    /** Stable key for React lists and drag-to-reorder. Never shown. */
    id: string;
    title: string;
    /** Free text, rendered verbatim (e.g. "April 20, 2026"). */
    date: string;
    /** Post permalink. Inert links are "#". */
    href: string;
    thumbnail: PostThumbnail;
}

export default interface Settings extends WidgetDefaultSettings {
    /** Section heading, e.g. "Recent Posts". Rendered uppercase. */
    heading?: string;
    /** Optional href that wraps the heading. Empty string = plain heading. */
    headingLink?: string;
    /** The 200px rust rule under the heading. */
    showDivider?: boolean;
    posts?: Post[];
    /** Thumbnail edge length in px at >= 768px viewports. */
    thumbnailSize?: number;
    buttonCaption?: string;
    buttonAction?: string;
    cssId?: string;
}
