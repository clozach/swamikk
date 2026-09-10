import { WidgetDefaultSettings } from "@courselit/common-models";
import type { ImageSource } from "../../components/image-source";

/**
 * A single event card in the "Appearances and events" section.
 *
 * The picture is the shared `ImageSource` union (URL · media library ·
 * placeholder), so a card can be a waiting-for-asset well until the real
 * poster arrives. Documents saved before 2026-09-10 carry a plain `imageUrl`
 * string instead; `normalize.ts` folds it into `image` at the boundary, so
 * the render path only ever reads `image`.
 */
export interface GatheringEvent {
    /** Stable key for React lists + drag/reorder. Generated on creation. */
    id: string;
    title: string;
    /** Where the title navigates. "#" until the real event pages exist. */
    href: string;
    /** Where the card's picture comes from. Absent only on legacy documents. */
    image?: ImageSource;
    /**
     * @deprecated Legacy plain URL (pre-2026-09-10). Read once by
     * `normalize.ts`, never written; the editor drops it on save.
     */
    imageUrl?: string;
    imageAlt: string;
    /** e.g. "Hosted by: Anahata Yoga Retreat" */
    hostLine: string;
    /** e.g. "Saturday 01 August, 2026 @ 12:00 am – Saturday 31 October, 2026 @ 11:59 pm" */
    dateRange: string;
    excerpt: string;
}

/**
 * The section heading is either a link or inert text. Modelled as a tagged
 * union so "linked but no href" and "plain but has a stale href" are
 * unrepresentable.
 */
export type HeadingLink = { kind: "linked"; href: string } | { kind: "plain" };

/**
 * How the cards lay out. `row` = one horizontal card (16:9 well left, text
 * right; stacked on phones). `grid` = the 1/2/4-up card grid. When the
 * setting is absent the widget picks `row` for exactly one event and `grid`
 * otherwise (`resolveLayout` in `normalize.ts`).
 */
export type GatheringsLayout = "grid" | "row";

/** The link under the cards, e.g. "All Anahata events ↗". */
export interface MoreLink {
    label: string;
    href: string;
}

export default interface Settings extends WidgetDefaultSettings {
    /** Section heading, e.g. "Appearances and events". */
    title?: string;
    /** Paragraph under the heading. Empty string hides it. */
    intro?: string;
    /** Whether the heading navigates, and to where. */
    headingLink?: HeadingLink;
    /** A short pine rule beneath the heading. */
    showDivider?: boolean;
    /** Cards, in render order. */
    events?: GatheringEvent[];
    /** Absent = automatic (row for one event, grid for more). */
    layout?: GatheringsLayout;
    /** Link rendered under the cards. Empty label or href hides it. */
    moreLink?: MoreLink;
    cssId?: string;
}
