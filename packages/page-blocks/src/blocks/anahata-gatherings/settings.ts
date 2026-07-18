import { WidgetDefaultSettings } from "@courselit/common-models";

/**
 * A single event card in the "Upcoming Gatherings" grid.
 *
 * `imageUrl` is a plain URL string rather than a `Media` object so that the
 * staged same-origin assets under `/anahata/*` can be referenced directly.
 * Any absolute URL (e.g. a MediaLit file URL) works equally well.
 */
export interface GatheringEvent {
    /** Stable key for React lists + drag/reorder. Generated on creation. */
    id: string;
    title: string;
    /** Where the card navigates. "#" until the real event pages exist. */
    href: string;
    imageUrl: string;
    imageAlt: string;
    /** e.g. "Hosted by: Anahata Yoga Retreat" */
    hostLine: string;
    /** e.g. "Thursday 02 July, 2026 - Thursday 23 July, 2026" */
    dateRange: string;
    excerpt: string;
}

/**
 * The section heading is either a link (the real site's banner points at the
 * shop) or inert text. Modelled as a tagged union so "linked but no href" and
 * "plain but has a stale href" are unrepresentable.
 */
export type HeadingLink = { kind: "linked"; href: string } | { kind: "plain" };

export default interface Settings extends WidgetDefaultSettings {
    /** Section heading, e.g. "Upcoming Gatherings". */
    title?: string;
    /** Whether the heading navigates, and to where. */
    headingLink?: HeadingLink;
    /** The rust rule beneath the heading. */
    showDivider?: boolean;
    /** Cards, in render order. */
    events?: GatheringEvent[];
    cssId?: string;
}
