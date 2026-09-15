import type { Media, WidgetDefaultSettings } from "@courselit/common-models";
import type { ImageSource } from "../../components/image-source";

/**
 * A post's picture: the shared image source plus the post's own alt text.
 * `source` absent means no picture and no well — the 3:2 box stays, empty,
 * so the card keeps its geometry.
 */
export interface PostImage {
    source?: ImageSource;
    alt: string;
}

/**
 * The flat shape stored before the shared union (alt inside each arm). It is
 * still present in saved layouts and is what `apply-homepage.sh` writes, so
 * it stays readable forever via `normalizePostThumbnail`; the admin editor
 * only ever writes `PostImage` back.
 */
export type PostThumbnail =
    | { kind: "url"; url: string; alt?: string }
    | { kind: "media"; media: Partial<Media>; alt?: string }
    | { kind: "placeholder"; description: string; alt?: string };

export interface Post {
    /** Stable key for React lists and drag-to-reorder. Never shown. */
    id: string;
    title: string;
    /** Free text, rendered verbatim (e.g. "September 7, 2026"). */
    date: string;
    /** Post permalink, `/blog/<slug>`. Inert links are "#". */
    href: string;
    thumbnail: PostImage | PostThumbnail;
}

/** The link under the cards, e.g. "Read the blog" → "/blog". */
export interface MoreLink {
    label: string;
    href: string;
}

/**
 * Keys a pre-redesign layout may still carry and this block now ignores:
 * `showDivider` (the rust rule is gone) and `thumbnailSize` (the wells are
 * 3:2 and fill their column).
 */
export default interface Settings extends WidgetDefaultSettings {
    /** Section heading. Default "Writing and recipes". */
    heading?: string;
    /** Optional href that wraps the heading. Empty string = plain heading. */
    headingLink?: string;
    posts?: Post[];
    moreLink?: MoreLink;
    /** @deprecated pre-redesign name for `moreLink.label`; read only when `moreLink` is absent. */
    buttonCaption?: string;
    /** @deprecated pre-redesign name for `moreLink.href`; read only when `moreLink` is absent. */
    buttonAction?: string;
    cssId?: string;
}
