import type { GatheringEvent, HeadingLink } from "./settings";

/**
 * Anahata content defaults. Every string here is editable from the page
 * builder — these are only the values a freshly-added block starts with.
 * Copy is verbatim from anahata-retreat.org.nz's home page.
 */

export const title = "Upcoming Gatherings";

export const headingLink: HeadingLink = { kind: "linked", href: "/products" };

export const showDivider = true;

export const hostLine = "Hosted by: Anahata Yoga Retreat";

export const events: GatheringEvent[] = [
    {
        id: "anahata-gathering-resilience",
        title: "2026 Developing Resilience ONLINE COURSE",
        href: "#",
        imageUrl: "/anahata/event-resilience.png",
        imageAlt: "2026 Developing Resilience online course",
        hostLine,
        dateRange: "Thursday 02 July, 2026 - Thursday 23 July, 2026",
        excerpt:
            "Are you wanting to improve your ability to withstand life's challenges? Do you wish you had a greater capacity to…",
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
