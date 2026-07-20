import type { GatheringEvent, HeadingLink } from "./settings";

/**
 * Anahata content defaults. Every string here is editable from the page
 * builder — these are only the values a freshly-added block starts with.
 * Copy is verbatim from anahata-retreat.org.nz's home page, EXCEPT the first
 * gathering (below), whose title/excerpt come from the merged
 * Anahata+Thinkific product spec instead — the site's own "Building
 * Resilience"/"Developing Resilience" naming disagrees with itself (stale
 * SEO tag vs. actual H1), so the spec's reconciled title is ground truth
 * here rather than either page's literal text.
 */

export const title = "Upcoming Gatherings";

export const headingLink: HeadingLink = { kind: "linked", href: "/products" };

export const showDivider = true;

export const hostLine = "Hosted by: Anahata Yoga Retreat";

export const events: GatheringEvent[] = [
    {
        id: "anahata-gathering-resilience",
        title: "2026 Developing Resilience Online Course",
        // Deep-links to the resilience course's own sales page (was "/products"
        // while no product existed). Al, 2026-07-20: the home card should land
        // straight on the course, not the store listing.
        href: "/p/2026-developing-resilience-online-course",
        imageUrl: "/anahata/course-building-resilience-2026.png",
        imageAlt:
            "Building Resilience — 4-week online course guided by Swami Karma Karuna, July 2026",
        hostLine,
        dateRange: "Thursday 02 July, 2026 - Thursday 23 July, 2026",
        excerpt:
            "Are you wanting to improve your ability to withstand life's challenges? Do you wish you had a greater capacity to cope and adapt to adversity?…",
    },
    {
        id: "anahata-gathering-inner-elements",
        title: "Ignite Your Inner Elements — Free Online Course: Hatha Yoga, Meditation & Presentation",
        href: "#",
        imageUrl: "/anahata/event-inner-elements.png",
        imageAlt: "Ignite Your Inner Elements free online course",
        hostLine,
        dateRange: "Sunday 19 July, 2026 @ 7:00 am - 8:30 am",
        excerpt:
            "Join Swami Karma Karuna for a free online session exploring the Pancha Tattwas — Earth, Water, Fire, Air, and Space.…",
    },
    {
        id: "anahata-gathering-european-tour",
        title: "European Tour 2026",
        href: "#",
        imageUrl: "/anahata/event-european-tour.png",
        imageAlt: "European Tour 2026",
        hostLine,
        dateRange:
            "Saturday 01 August, 2026 @ 12:00 am - Saturday 31 October, 2026 @ 11:59 pm",
        excerpt:
            "Swami Karma Karuna returns to Europe this NZ Winter for another European Summer Tour.",
    },
    {
        id: "anahata-gathering-norway",
        title: "Connecting to your Inner Light: A Journey through Chakra, Mantra & Prana – NORWAY 2026",
        href: "#",
        imageUrl: "/anahata/event-norway.png",
        imageAlt: "Connecting to your Inner Light — Norway 2026",
        hostLine,
        dateRange:
            "Saturday 01 August, 2026 @ 4:30 pm - Saturday 08 August, 2026 @ 2:30 pm",
        excerpt:
            "Join Swami Karma Karuna at the stunning Dharma Mountain Retreat in Norway",
    },
];

/** Shape a brand-new card starts with when Karuna clicks "Add event". */
export const blankEvent: Omit<GatheringEvent, "id"> = {
    title: "New gathering",
    href: "#",
    imageUrl: "",
    imageAlt: "",
    hostLine,
    dateRange: "",
    excerpt: "",
};
