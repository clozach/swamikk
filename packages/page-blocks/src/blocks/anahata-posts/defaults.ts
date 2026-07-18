import type { Post } from "./settings";

/**
 * Anahata brand palette used by this block.
 *
 * Source of truth: anahata-design-system/tokens.css. These constants exist for
 * documentation and for the admin preview only — the rendered markup writes the
 * hexes as literal Tailwind arbitrary values (`bg-[#f8ecdb]`), because Tailwind's
 * scanner is static and cannot see an interpolated class name.
 */
export const palette = {
    /** Recent Posts ground (the site's `.bg-apricot`; absent from tokens.css). */
    apricot: "#f8ecdb",
    /** Body text. */
    ink: "#545454",
    /** Headings, hovers, the divider rule. */
    rust: "#993300",
    /** Links and buttons. */
    saffron: "#ff9900",
    /** Pressed-button rust, darkened ~12%. Not in the source stylesheet. */
    rustPressed: "#7a2900",
    /** The dashed rule under each card. */
    warmDashed: "#d7cdbf",
} as const;

export const heading = "Recent Posts";
export const headingLink = "";
export const showDivider = true;
export const thumbnailSize = 150;
export const buttonCaption = "Read More at Our Blog";
export const buttonAction = "/blog";
export const verticalPadding = "py-12" as const;

/** Curly quotes below are verbatim from the live site — do not straighten them. */
export const posts: Post[] = [
    {
        id: "anahata-post-kumara-salad",
        title: "The Vitality Kumara & Smoked Fish Salad",
        date: "April 20, 2026",
        href: "#",
        thumbnail: {
            kind: "url",
            url: "/anahata/post-kumara-salad.jpg",
            alt: "The Vitality Kumara & Smoked Fish Salad",
        },
    },
    {
        id: "anahata-post-menopause",
        title: "Navigating the Change: A Guide to Embracing Menopause",
        date: "April 20, 2026",
        href: "#",
        thumbnail: {
            kind: "url",
            url: "/anahata/post-menopause.png",
            alt: "Navigating the Change: A Guide to Embracing Menopause",
        },
    },
    {
        id: "anahata-post-autumn-tonic",
        title: "The “Autumn Anchor” Tonic",
        date: "March 12, 2026",
        href: "#",
        thumbnail: {
            kind: "url",
            url: "/anahata/post-autumn-tonic.png",
            alt: "The “Autumn Anchor” Tonic",
        },
    },
    {
        id: "anahata-post-nervous-system",
        title: "Beyond the Stretch: Why a Nervous System Reset is the Ultimate Life Cleaning",
        date: "March 12, 2026",
        href: "#",
        thumbnail: {
            kind: "url",
            url: "/anahata/post-nervous-system.png",
            alt: "Beyond the Stretch: Why a Nervous System Reset is the Ultimate Life Cleaning",
        },
    },
    {
        id: "anahata-post-nourish-bowl",
        title: "The “Kiwi Yogi” Nourish Bowl",
        date: "February 18, 2026",
        href: "#",
        thumbnail: {
            kind: "url",
            url: "/anahata/post-nourish-bowl.png",
            alt: "The “Kiwi Yogi” Nourish Bowl",
        },
    },
    {
        id: "anahata-post-tempeh-salad",
        title: "Crunchy Marinated Tempeh Salad",
        date: "February 9, 2026",
        href: "#",
        thumbnail: {
            kind: "url",
            url: "/anahata/post-tempeh-salad.png",
            alt: "Crunchy Marinated Tempeh Salad",
        },
    },
];

export const newPost = (id: string): Post => ({
    id,
    title: "Post title",
    date: "January 1, 2026",
    href: "#",
    thumbnail: { kind: "url", url: "", alt: "" },
});

/** Resolves either arm of the thumbnail union to a src string. */
export const thumbnailSrc = (thumbnail: Post["thumbnail"]): string =>
    thumbnail.kind === "media"
        ? thumbnail.media?.file || thumbnail.media?.thumbnail || ""
        : thumbnail.url;
