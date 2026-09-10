import React from "react";
import { WidgetProps } from "@courselit/common-models";
import { ThemeStyle } from "@courselit/page-models";
import { Section } from "@courselit/page-primitives";
import { Link } from "@courselit/components-library";
import { FONT_BODY, FONT_DISPLAY, PALETTE } from "../../components/palette";
import {
    hasWell,
    isWaiting,
    resolveImageSrc,
} from "../../components/image-source";
import { WaitingForAsset } from "../../components/waiting-for-asset";
import Settings, {
    GatheringEvent,
    GatheringsLayout,
    HeadingLink,
} from "./settings";
import {
    headingLink as defaultHeadingLink,
    intro as defaultIntro,
    showDivider as defaultShowDivider,
    title as defaultTitle,
} from "./defaults";
import {
    eventImage,
    normalizeEvents,
    normalizeLayout,
    normalizeMoreLink,
    resolveLayout,
} from "./normalize";

/**
 * Palette: swamikk design system v1.0 (`components/palette.ts`), by role.
 * Colours are constants, not settings — this section is painted from the
 * one palette the whole homepage shares, and every pairing below was
 * measured there (ink 13.63:1 and pine 9.10:1 on card; ink 12.31:1, pine
 * 8.22:1 and ink-soft 6.81:1 on bone; edge 3.72:1 vs bone for the card
 * border). The section ground itself is the theme's `background`, which the
 * theme script sets to bone.
 *
 * The next/font variables win when the app defines them; the palette's
 * stacks are the fallback.
 */
const DISPLAY = `var(--font-playfair-display), ${FONT_DISPLAY}`;
const BODY = `var(--font-open-sans), ${FONT_BODY}`;
const { pine, pineDeep, ink, inkSoft, card, edge, wellGround } = PALETTE;

const ROOT = "anahata-gatherings";

/**
 * Scoped stylesheet. Raw CSS is the right channel here (exact px breakpoints
 * at 768/960, pseudo-classes, a grid template) and it is namespaced under
 * `.anahata-gatherings` so it cannot leak. It ships inline with the block so
 * the block stays self-contained.
 *
 * Only real links react to hover, and every hover rule has its `:active`
 * twin so keyboard and touch see the same state. Cards, images and wells are
 * inert: no lift, no zoom, no colour shift.
 */
const css = `
.${ROOT} {
    font-family: ${BODY};
    color: ${ink};
    line-height: 1.65;
    text-align: left;
}
.${ROOT}__heading {
    font-family: ${DISPLAY};
    font-size: clamp(28px, 3vw, 36px);
    font-weight: 400;
    line-height: 1.15;
    letter-spacing: -0.01em;
    color: ${pine};
    margin: 0;
}
.${ROOT}__heading-link {
    color: inherit;
    text-decoration: none;
    border-radius: 2px;
}
.${ROOT}__heading-link:hover,
.${ROOT}__heading-link:active {
    color: ${pineDeep};
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 0.16em;
}
.${ROOT}__heading-link:focus-visible {
    outline: 3px solid ${pine};
    outline-offset: 3px;
}
.${ROOT}__divider {
    width: 64px;
    height: 0;
    border: 0;
    border-bottom: 2px solid ${pine};
    margin: 16px 0 0;
}
.${ROOT}__intro {
    font-size: 16px;
    line-height: 1.65;
    color: ${ink};
    max-width: 62ch;
    margin: 16px 0 0;
}
.${ROOT}__cards { margin-top: 40px; }

/* ---- the card, shared by both layouts ---- */
.${ROOT}__card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: ${card};
    border: 1px solid ${edge};
    border-radius: 6px;
    overflow: hidden;
    color: inherit;
}
.${ROOT}__media {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: ${wellGround};
    border-bottom: 1px solid ${edge};
}
/* The image and the waiting-for-asset well occupy the identical box. */
.${ROOT}__img {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
}
.${ROOT}__media .ayr-well { border-radius: 0; }
.${ROOT}__body {
    display: flex;
    flex-direction: column;
    padding: 20px 20px 24px;
    min-width: 0;
}
.${ROOT}__title {
    font-family: ${DISPLAY};
    font-size: 22px;
    font-weight: 400;
    line-height: 1.25;
    color: ${pine};
    margin: 0;
    overflow-wrap: anywhere;
}
.${ROOT}__title-link {
    color: inherit;
    text-decoration: none;
    border-radius: 2px;
}
.${ROOT}__title-link:hover,
.${ROOT}__title-link:active {
    color: ${pineDeep};
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 0.16em;
}
.${ROOT}__title-link:focus-visible {
    outline: 3px solid ${pine};
    outline-offset: 3px;
}
.${ROOT}__meta {
    font-size: 14px;
    line-height: 1.65;
    color: ${inkSoft};
    margin: 6px 0 0;
    overflow-wrap: anywhere;
}
.${ROOT}__meta + .${ROOT}__meta { margin-top: 2px; }
.${ROOT}__excerpt {
    font-size: 16px;
    line-height: 1.65;
    color: ${ink};
    margin: 14px 0 0;
    overflow-wrap: anywhere;
}

/* ---- grid: 1 / 2 / 4 across ---- */
.${ROOT}__grid {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    align-items: stretch;
    width: 100%;
}
.${ROOT}__grid .${ROOT}__card { flex: 0 1 100%; max-width: 100%; }
@media (min-width: 768px) {
    .${ROOT}__grid .${ROOT}__card {
        flex-basis: calc((100% - 20px) / 2);
        max-width: calc((100% - 20px) / 2);
    }
}
@media (min-width: 960px) {
    .${ROOT}__grid .${ROOT}__card {
        flex-basis: calc((100% - 60px) / 4);
        max-width: calc((100% - 60px) / 4);
    }
    .${ROOT}__grid .${ROOT}__title { font-size: 19px; }
}

/* ---- row: one horizontal card, well left (~45%), text right ---- */
.${ROOT}__rows {
    display: flex;
    flex-direction: column;
    gap: 20px;
}
.${ROOT}__card--row { max-width: 980px; }
@media (min-width: 768px) {
    .${ROOT}__card--row.${ROOT}__card--with-media {
        display: grid;
        grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
        align-items: stretch;
    }
    .${ROOT}__card--row.${ROOT}__card--with-media .${ROOT}__media {
        border-bottom: 0;
        border-right: 1px solid ${edge};
    }
    .${ROOT}__card--row .${ROOT}__body {
        padding: 28px 32px;
        justify-content: center;
    }
}

/* ---- the link under the cards ---- */
.${ROOT}__more {
    margin: 32px 0 0;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.65;
}
.${ROOT}__more-link {
    color: ${pine};
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.16em;
    border-radius: 2px;
}
.${ROOT}__more-link:hover,
.${ROOT}__more-link:active {
    color: ${pineDeep};
    text-decoration-thickness: 2px;
}
.${ROOT}__more-link:focus-visible {
    outline: 3px solid ${pine};
    outline-offset: 3px;
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

/** The 16:9 box: the real picture, or the waiting-for-asset well in its place. */
function EventMedia({ event }: { event: GatheringEvent }) {
    const source = eventImage(event);
    if (!hasWell(source)) return null;
    return (
        <div className={`${ROOT}__media`}>
            {isWaiting(source) ? (
                <WaitingForAsset fill description={source.description} />
            ) : (
                /* Plain <img>: sources are same-origin /public paths or media
                   files and the box is fixed by aspect-ratio, so next/image
                   buys nothing here and would need a host allowlist for
                   arbitrary URLs Karuna pastes in. */
                <img
                    className={`${ROOT}__img`}
                    src={resolveImageSrc(source)}
                    alt={event.imageAlt || ""}
                    loading="lazy"
                    decoding="async"
                />
            )}
        </div>
    );
}

function EventCard({
    event,
    layout,
}: {
    event: GatheringEvent;
    layout: GatheringsLayout;
}) {
    const withMedia = hasWell(eventImage(event));
    const classes = [
        `${ROOT}__card`,
        layout === "row" && `${ROOT}__card--row`,
        withMedia && `${ROOT}__card--with-media`,
    ]
        .filter(Boolean)
        .join(" ");
    const isLinked = Boolean(event.href) && event.href !== "#";

    return (
        <article className={classes}>
            <EventMedia event={event} />
            <div className={`${ROOT}__body`}>
                <h3 className={`${ROOT}__title`}>
                    {isLinked ? (
                        <Link
                            href={event.href}
                            className={`${ROOT}__title-link`}
                        >
                            {event.title}
                        </Link>
                    ) : (
                        event.title
                    )}
                </h3>
                {event.hostLine && (
                    <p className={`${ROOT}__meta`}>{event.hostLine}</p>
                )}
                {event.dateRange && (
                    <p className={`${ROOT}__meta`}>{event.dateRange}</p>
                )}
                {event.excerpt && (
                    <p className={`${ROOT}__excerpt`}>{event.excerpt}</p>
                )}
            </div>
        </article>
    );
}

export default function Widget({
    settings: {
        title = defaultTitle,
        intro = defaultIntro,
        headingLink,
        showDivider = defaultShowDivider,
        events,
        layout,
        moreLink,
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
    // Ids only matter to the editor; a stored card without one keys by index.
    const cards = normalizeEvents(events, () => "");
    const shape = resolveLayout(normalizeLayout(layout), cards.length);
    const more = normalizeMoreLink(moreLink);

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
                {intro && <p className={`${ROOT}__intro`}>{intro}</p>}
                {cards.length > 0 && (
                    <div
                        className={`${ROOT}__cards ${ROOT}__${
                            shape === "row" ? "rows" : "grid"
                        }`}
                    >
                        {cards.map((event, index) => (
                            <EventCard
                                key={event.id || `${ROOT}-${index}`}
                                event={event}
                                layout={shape}
                            />
                        ))}
                    </div>
                )}
                {more.label && more.href && (
                    <p className={`${ROOT}__more`}>
                        <Link href={more.href} className={`${ROOT}__more-link`}>
                            {more.label}
                        </Link>
                    </p>
                )}
            </div>
        </Section>
    );
}
