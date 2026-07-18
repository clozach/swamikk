import React from "react";
import { WidgetProps } from "@courselit/common-models";
import { ThemeStyle } from "@courselit/page-models";
import { Section } from "@courselit/page-primitives";
import { Link } from "@courselit/components-library";
import Settings, { GatheringEvent, HeadingLink } from "./settings";
import {
    events as defaultEvents,
    headingLink as defaultHeadingLink,
    showDivider as defaultShowDivider,
    title as defaultTitle,
} from "./defaults";

/**
 * Anahata palette (anahata-design-system/tokens.css). These are brand colours,
 * deliberately not theme tokens: the section reproduces the retreat's own
 * cream/saffron/rust identity rather than the CourseLit theme.
 */
const SAFFRON = "#ff9900";
const RUST = "#993300";
const INK = "#545454";
const COCOA = "#312110";
const CREAM = "#f7f4eb";
const FONT_DISPLAY =
    'var(--font-playfair-display), "Playfair Display", Georgia, serif';
const FONT_BODY =
    'var(--font-open-sans), "Open Sans", -apple-system, "Segoe UI", sans-serif';
const DUR_HOVER = "100ms";

const ROOT = "anahata-gatherings";

/**
 * Scoped stylesheet. Raw CSS is the right channel here (exact px breakpoints at
 * 768/960/767, pseudo-classes, descendant hover) and it is namespaced under
 * `.anahata-gatherings` so it cannot leak. It ships inline with the block
 * rather than in the package's shared `styles.css` so this block stays
 * self-contained.
 */
const css = `
.${ROOT} {
    font-family: ${FONT_BODY};
    color: ${INK};
    line-height: 1.65;
    text-align: left;
}
.${ROOT}__heading {
    font-family: ${FONT_DISPLAY};
    font-size: 32px;
    font-weight: 400;
    color: ${RUST};
    line-height: 1.2;
    text-align: center;
    margin: 0;
    padding-bottom: 15px;
}
.${ROOT}__heading-link {
    color: inherit;
    text-decoration: none;
    border-radius: 2px;
    transition: color ${DUR_HOVER} ease-in;
}
.${ROOT}__heading-link:hover { color: ${SAFFRON}; }
.${ROOT}__heading-link:active { color: ${RUST}; }
.${ROOT}__heading-link:focus-visible {
    outline: 2px solid ${RUST};
    outline-offset: 4px;
}
.${ROOT}__divider {
    width: 80%;
    max-width: 200px;
    height: 0;
    border: 0;
    border-bottom: 2px solid ${RUST};
    margin: 0 auto 55px;
}
.${ROOT}__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px;
    align-items: start;
    width: 100%;
}
@media (min-width: 768px) {
    .${ROOT}__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 960px) {
    .${ROOT}__grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.${ROOT}__card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: transparent;
    border: none;
    color: inherit;
    text-decoration: none;
    border-radius: 4px;
    transition:
        transform ${DUR_HOVER} ease-in,
        box-shadow ${DUR_HOVER} ease-in;
}
/* Interactive affordances apply only to cards that actually navigate, so a
   card with no link never falsely signals clickability. */
.${ROOT}__card--linked:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 20px rgba(49, 33, 16, 0.14);
}
.${ROOT}__card--linked:active { transform: translateY(-1px); }
.${ROOT}__card--linked:focus-visible {
    outline: 2px solid ${RUST};
    outline-offset: 4px;
}
.${ROOT}__media {
    position: relative;
    overflow: hidden;
    width: 100%;
    aspect-ratio: 768 / 570;
    background-color: ${CREAM};
    border-radius: 4px;
}
.${ROOT}__img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    transition: transform ${DUR_HOVER} ease-in;
}
.${ROOT}__card--linked:hover .${ROOT}__img { transform: scale(1.03); }
.${ROOT}__details { padding: 12px 0 0; border: none; }
.${ROOT}__title {
    font-family: ${FONT_DISPLAY};
    font-size: 15px;
    font-weight: 700;
    color: ${SAFFRON};
    line-height: 1.35;
    margin: 0;
    padding-bottom: 8px;
    overflow-wrap: anywhere;
    transition: color ${DUR_HOVER} ease-in;
}
.${ROOT}__card--linked:hover .${ROOT}__title,
.${ROOT}__card--linked:focus-visible .${ROOT}__title { color: ${RUST}; }
.${ROOT}__date {
    font-size: 14px;
    color: ${INK};
    line-height: 1.65;
    margin: 0 0 5px;
    overflow-wrap: anywhere;
}
.${ROOT}__excerpt {
    font-size: 14px;
    color: ${INK};
    line-height: 1.65;
    margin: 15px 0;
    overflow-wrap: anywhere;
}
@media (max-width: 767px) {
    .${ROOT}__card {
        border-bottom: 1px solid ${COCOA};
        padding-bottom: 20px;
    }
}
@media (prefers-reduced-motion: reduce) {
    .${ROOT}__card,
    .${ROOT}__img,
    .${ROOT}__title,
    .${ROOT}__heading-link { transition: none; }
    .${ROOT}__card--linked:hover,
    .${ROOT}__card--linked:active { transform: none; }
    .${ROOT}__card--linked:hover .${ROOT}__img { transform: none; }
}
`;

/**
 * Settings arrive from the database, where an older or hand-edited document may
 * not match the current shape. Parse at the boundary so the render path can
 * trust it.
 */
function normalizeHeadingLink(value: unknown): HeadingLink {
    if (value && typeof value === "object" && "kind" in value) {
        const candidate = value as HeadingLink;
        if (candidate.kind === "plain") {
            return { kind: "plain" };
        }
        if (candidate.kind === "linked" && typeof candidate.href === "string") {
            return { kind: "linked", href: candidate.href };
        }
    }
    return defaultHeadingLink;
}

function Heading({
    title,
    headingLink,
}: {
    title: string;
    headingLink: HeadingLink;
}) {
    if (headingLink.kind === "linked" && headingLink.href) {
        return (
            <h2 className={`${ROOT}__heading`}>
                <Link
                    href={headingLink.href}
                    className={`${ROOT}__heading-link`}
                >
                    {title}
                </Link>
            </h2>
        );
    }
    return <h2 className={`${ROOT}__heading`}>{title}</h2>;
}

function EventCard({ event }: { event: GatheringEvent }) {
    const card = (
        <>
            {event.imageUrl && (
                <div className={`${ROOT}__media`}>
                    {/* Plain <img>: sources are same-origin /public paths and
                        the size is fixed by aspect-ratio, so next/image buys
                        nothing here and would need a host allowlist for
                        arbitrary URLs Karuna pastes in. */}
                    <img
                        className={`${ROOT}__img`}
                        src={event.imageUrl}
                        alt={event.imageAlt || ""}
                        loading="lazy"
                        decoding="async"
                    />
                </div>
            )}
            <div className={`${ROOT}__details`}>
                <h3 className={`${ROOT}__title`}>{event.title}</h3>
                {(event.hostLine || event.dateRange) && (
                    <div className={`${ROOT}__date`}>
                        {event.hostLine && <span>{event.hostLine}</span>}
                        {event.hostLine && event.dateRange && <br />}
                        {event.dateRange && <span>{event.dateRange}</span>}
                    </div>
                )}
                {event.excerpt && (
                    <p className={`${ROOT}__excerpt`}>{event.excerpt}</p>
                )}
            </div>
        </>
    );

    if (!event.href) {
        return <div className={`${ROOT}__card`}>{card}</div>;
    }

    return (
        <Link
            href={event.href}
            className={`${ROOT}__card ${ROOT}__card--linked`}
        >
            {card}
        </Link>
    );
}

export default function Widget({
    settings: {
        title = defaultTitle,
        headingLink,
        showDivider = defaultShowDivider,
        events,
        cssId,
        maxWidth,
        verticalPadding,
        background,
    },
    state: { theme },
    nextTheme,
}: WidgetProps<Settings>) {
    const overiddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
    overiddenTheme.structure.page.width =
        maxWidth || theme.theme.structure.page.width;
    overiddenTheme.structure.section.padding.y =
        verticalPadding || theme.theme.structure.section.padding.y;

    const heading = normalizeHeadingLink(headingLink);
    const cards: GatheringEvent[] = Array.isArray(events)
        ? events
        : defaultEvents;

    return (
        <Section
            theme={overiddenTheme}
            id={cssId}
            background={background}
            nextTheme={nextTheme as "dark" | "light"}
        >
            <style dangerouslySetInnerHTML={{ __html: css }} />
            <div className={ROOT}>
                {title && <Heading title={title} headingLink={heading} />}
                {showDivider && <hr className={`${ROOT}__divider`} />}
                {cards.length > 0 && (
                    <div className={`${ROOT}__grid`}>
                        {cards.map((event, index) => (
                            <EventCard
                                key={event.id || `${ROOT}-${index}`}
                                event={event}
                            />
                        ))}
                    </div>
                )}
            </div>
        </Section>
    );
}
