import {
    normalizeImageSource,
    urlSource,
    type ImageSource,
} from "../../components/image-source";
import type { GatheringEvent, GatheringsLayout, MoreLink } from "./settings";
import {
    events as defaultEvents,
    moreLink as defaultMoreLink,
} from "./defaults";

/**
 * Boundary parsers. Settings arrive from the database, where an older or
 * hand-edited document may not match the current shape; both the widget and
 * the editor parse here so the render path can trust what it reads.
 */

/**
 * The card's picture: the new `image` field, else the legacy `imageUrl`
 * string folded through the shared parser. `undefined` when neither carries
 * anything usable (an empty URL arm is kept — "nothing typed yet").
 */
export function eventImage(
    event: Pick<GatheringEvent, "image" | "imageUrl">,
): ImageSource | undefined {
    return (
        normalizeImageSource(event.image) ??
        normalizeImageSource(event.imageUrl)
    );
}

/**
 * Stored events → the editor's shape: always an array, every card with a
 * stable id, `image` always present (legacy `imageUrl` folded in and dropped,
 * so the document converges on the new shape when the editor next saves).
 */
export function normalizeEvents(
    events: unknown,
    makeId: () => string,
): GatheringEvent[] {
    const source: GatheringEvent[] = Array.isArray(events)
        ? (events as GatheringEvent[])
        : defaultEvents;
    return source.map((event) => {
        const { imageUrl: _legacy, ...rest } = event;
        return {
            ...rest,
            id: event.id || makeId(),
            image: eventImage(event) ?? urlSource(""),
        };
    });
}

export function normalizeLayout(value: unknown): GatheringsLayout | undefined {
    return value === "grid" || value === "row" ? value : undefined;
}

/** The layout to render: the explicit setting, else row for one card, grid otherwise. */
export function resolveLayout(
    layout: GatheringsLayout | undefined,
    cardCount: number,
): GatheringsLayout {
    return layout ?? (cardCount === 1 ? "row" : "grid");
}

/**
 * `undefined` (field absent) → the default link. An object with both strings
 * → kept as is, even when empty: an admin who blanks the label has hidden
 * the link on purpose, and the widget honours that.
 */
export function normalizeMoreLink(value: unknown): MoreLink {
    if (value === undefined || value === null) return defaultMoreLink;
    if (typeof value === "object") {
        const candidate = value as Partial<MoreLink>;
        return {
            label: typeof candidate.label === "string" ? candidate.label : "",
            href: typeof candidate.href === "string" ? candidate.href : "",
        };
    }
    return defaultMoreLink;
}
