import type { GatheringEvent, HeadingLink, MoreLink } from "./settings";
import { placeholderSource, urlSource } from "../../components/image-source";

/**
 * Content defaults for the "Appearances and events" section of the swamikk
 * homepage redesign (2026-09-10). Every string here is editable from the page
 * builder — these are only the values a freshly-added block starts with.
 *
 * Copy is verbatim from `homepage-redesign-spec.md § 4`: one real card (the
 * European Tour 2026, unchanged from the live site) whose picture is a
 * waiting-for-asset well carrying the spec's poster idea, and the link under
 * the cards to Anahata's gatherings page. No invented events.
 */

export const title = "Appearances and events";

export const intro =
    "Swami Karma Karuna teaches at retreats, trainings and gatherings in New Zealand, India, Europe, Australia and the USA.";

/** The redesign's heading is inert text; the navigation is `moreLink`. */
export const headingLink: HeadingLink = { kind: "plain" };

/** The reference look has no rule beneath the heading. */
export const showDivider = false;

export const hostLine = "Hosted by: Anahata Yoga Retreat";

export const events: GatheringEvent[] = [
    {
        id: "anahata-gathering-european-tour",
        title: "European Tour 2026",
        href: "https://www.anahata-retreat.org.nz/event/european-tour-2026",
        image: placeholderSource(
            "Tour poster — a map silhouette of Europe with the stops marked, the date range in bold, flat colour, no photograph.",
        ),
        imageAlt: "",
        hostLine,
        dateRange:
            "Saturday 01 August, 2026 @ 12:00 am – Saturday 31 October, 2026 @ 11:59 pm",
        excerpt:
            "Swami Karma Karuna returns to Europe this NZ Winter for another European Summer Tour.",
    },
];

export const moreLink: MoreLink = {
    label: "All Anahata events ↗",
    href: "https://www.anahata-retreat.org.nz/gatherings",
};

/** Shape a brand-new card starts with when Karuna clicks "Add event". */
export const blankEvent: Omit<GatheringEvent, "id"> = {
    title: "New gathering",
    href: "#",
    image: urlSource(""),
    imageAlt: "",
    hostLine,
    dateRange: "",
    excerpt: "",
};
