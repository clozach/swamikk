import { placeholderSource } from "../../components/image-source";
import type { MoreLink, Post } from "./settings";

export const heading = "Writing and recipes";
export const headingLink = "";
export const moreLink: MoreLink = { label: "Read the blog", href: "/blog" };
/** 96px, the reference look's `--rest`. */
export const verticalPadding = "py-24" as const;

const post = (
    id: string,
    title: string,
    date: string,
    slug: string,
    description: string,
): Post => ({
    id,
    title,
    date,
    href: `/blog/${slug}`,
    thumbnail: { source: placeholderSource(description), alt: "" },
});

/**
 * The six spec rows (homepage-redesign-spec.md § 5), newest first. Titles are
 * verbatim — keep the en dash in the India letter. Every picture is a well
 * until a real production photo is uploaded.
 */
export const posts: Post[] = [
    post(
        "anahata-post-roasted-vegetable-salad",
        "Roasted Vegetable Salad",
        "September 7, 2026",
        "roasted-vegetable-salad",
        "Overhead shot of the finished salad on a wooden table, natural light.",
    ),
    post(
        "anahata-post-menopause",
        "Navigating the Change: A Guide to Embracing Menopause",
        "April 20, 2026",
        "navigating-the-change-a-guide-to-embracing-menopause",
        "A woman mid-life, seated in meditation outdoors, calm and unposed.",
    ),
    post(
        "anahata-post-nervous-system",
        "Beyond the Stretch: Why a Nervous System Reset is the Ultimate Life Cleaning",
        "March 12, 2026",
        "beyond-the-stretch-why-a-nervous-system-reset-is-the-ultimate-life-cleaning",
        "A person lying in relaxation pose on a mat, eyes closed, soft light from a window.",
    ),
    post(
        "anahata-post-tempeh-salad",
        "Crunchy Marinated Tempeh Salad",
        "February 9, 2026",
        "crunchy-marinated-tempeh-salad",
        "Close-up of the tempeh salad in a bowl, crumbs of marinade visible.",
    ),
    post(
        "anahata-post-from-india-with-love",
        "From India with love – An update from Swami Karma Karuna",
        "January 4, 2026",
        "from-india-with-love-an-update-from-swami-karma-karuna",
        "Swami Karma Karuna at the Bihar School of Yoga ashram, morning light, a letter in hand.",
    ),
    post(
        "anahata-post-christmas-recipe",
        "Christmas Recipe",
        "November 26, 2025",
        "christmas-recipe",
        "A festive dish served on a plain cloth, a sprig of greenery beside it.",
    ),
];

/** A fresh post starts as a well (the development staple), description to be typed. */
export const newPost = (id: string): Post => ({
    id,
    title: "Post title",
    date: "January 1, 2026",
    href: "#",
    thumbnail: { source: placeholderSource(""), alt: "" },
});
