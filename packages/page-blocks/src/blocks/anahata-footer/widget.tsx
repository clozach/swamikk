"use client";

import React, { useCallback, useEffect, useState } from "react";
import { WidgetProps } from "@courselit/common-models";
import { Link, cn } from "@courselit/components-library";
import { Facebook, Instagram, Youtube, ExpandLess } from "@courselit/icons";
import Settings, {
    ContactColumn,
    FooterColumn,
    LinksColumn,
    SocialLink,
    SocialPlatform,
} from "./settings";
import {
    BACK_TO_TOP_OFFSET,
    BACK_TO_TOP_SIZE,
    COLUMN_GAP,
    COLUMN_TITLE_SIZE,
    CONTACT_HEADING_SIZE,
    COPYRIGHT_FONT_SIZE,
    COPYRIGHT_LINE_HEIGHT,
    DECOR_LEFT_WIDTH,
    DECOR_RIGHT_WIDTH,
    FONT_BODY,
    FONT_DISPLAY,
    INNER_MAX_WIDTH,
    NAVY,
    OCEAN,
    OCEAN_HAIRLINE,
    PADDING_BOTTOM,
    PADDING_TOP,
    SOCIAL_BUTTON_SIZE,
    SOCIAL_GAP,
    SOCIAL_GLYPH_SIZE,
    WHITE,
    WIDGET_PADDING_BOTTOM,
    backToTop as defaultBackToTop,
    columns as defaultColumns,
    copyrightLinkHref as defaultCopyrightLinkHref,
    copyrightLinkLabel as defaultCopyrightLinkLabel,
    copyrightLinkPrefix as defaultCopyrightLinkPrefix,
    copyrightOwner as defaultCopyrightOwner,
    copyrightPrefix as defaultCopyrightPrefix,
    decorLeftUrl as defaultDecorLeftUrl,
    decorRightUrl as defaultDecorRightUrl,
} from "./defaults";

/**
 * Vimeo has no entry in @courselit/icons, so it is inlined here rather
 * than added to a shared package this block does not own.
 */
function VimeoGlyph({ size }: { size: number }): JSX.Element {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            focusable="false"
        >
            <path d="M22.4 7.3c-.1 2.2-1.6 5.2-4.6 9-3.1 3.9-5.7 5.9-7.8 5.9-1.3 0-2.4-1.2-3.3-3.6l-1.8-6.6C4.2 9.6 3.5 8.4 2.8 8.4c-.2 0-.7.3-1.5.9L.4 8.1c1-.8 1.9-1.7 2.8-2.5 1.3-1.1 2.3-1.7 2.9-1.8 1.5-.2 2.5.9 2.8 3.1.4 2.4.7 3.9.9 4.5.5 2.2 1 3.3 1.6 3.3.5 0 1.2-.7 2.1-2.2.9-1.5 1.4-2.6 1.5-3.3.1-1.1-.3-1.7-1.5-1.7-.5 0-1.1.1-1.7.4 1.1-3.6 3.2-5.4 6.3-5.3 2.3.1 3.4 1.6 3.3 4.7z" />
        </svg>
    );
}

/**
 * Desktop track sizing, as an inline style rather than a Tailwind class.
 *
 * This used to be `min-[960px]:grid-cols-N`, and the rule was emitted
 * correctly into this package's stylesheet — but it never won. Every
 * @courselit package ships its own full Tailwind build, and the app imports
 * page-blocks' sheet FIRST, so a later sheet's unmediated `.grid-cols-1`
 * (same specificity, later in source order) beat this one's media-scoped
 * `.grid-cols-3` at every width. The footer silently stacked into a single
 * column on desktop.
 *
 * `auto-fit` + `minmax` gets the same result without depending on which
 * package's stylesheet loaded last, and without a breakpoint at all: tracks
 * fold to one column when there is no room for two, and an inline style
 * cannot be overridden by any sheet. The 220px floor is what keeps a column
 * of uppercase link text from wrapping mid-word.
 */
const COLUMN_MIN_WIDTH = 220;

function gridTemplateColumns(count: number): string {
    const tracks = Math.min(Math.max(count, 1), 4);
    if (tracks === 1) {
        return "minmax(0, 1fr)";
    }
    return `repeat(auto-fit, minmax(min(${COLUMN_MIN_WIDTH}px, 100%), 1fr))`;
}

const socialLabels: Record<SocialPlatform, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    youtube: "YouTube",
    vimeo: "Vimeo",
};

function SocialGlyph({
    platform,
    size,
}: {
    platform: SocialPlatform;
    size: number;
}): JSX.Element {
    switch (platform) {
        case "facebook":
            return <Facebook width={size} height={size} aria-hidden="true" />;
        case "instagram":
            return <Instagram width={size} height={size} aria-hidden="true" />;
        case "youtube":
            return <Youtube width={size} height={size} aria-hidden="true" />;
        case "vimeo":
            return <VimeoGlyph size={size} />;
    }
}

/* The title block's own vertical extent, kept in one place because an
   untitled column has to reserve exactly this much to stay in line. */
const COLUMN_TITLE_LINE_HEIGHT = 1.2;
const COLUMN_TITLE_PADDING_Y = 5;
const COLUMN_TITLE_MARGIN_BOTTOM = 15;

/** Playfair Display, uppercase, 30px — the footer's column titles. */
function ColumnTitle({
    children,
    color,
}: {
    children: React.ReactNode;
    color: string;
}): JSX.Element {
    return (
        <h2
            className="uppercase"
            style={{
                fontFamily: FONT_DISPLAY,
                fontSize: `${COLUMN_TITLE_SIZE}px`,
                fontWeight: 400,
                lineHeight: COLUMN_TITLE_LINE_HEIGHT,
                color,
                padding: `${COLUMN_TITLE_PADDING_Y}px 10px ${COLUMN_TITLE_PADDING_Y}px 0`,
                margin: `0 0 ${COLUMN_TITLE_MARGIN_BOTTOM}px`,
            }}
        >
            {children}
        </h2>
    );
}

/**
 * The title row of a footer column — the heading, or nothing.
 *
 * An earlier pass had this reserve a title-height spacer for the untitled
 * contact column, so that every column started its content on one line.
 * Against the real footer that reads worse: the contact column leads with a
 * tall logo, and holding it down by a title height leaves it visibly
 * bottom-heavy beside two columns of short links. The source site starts
 * that logo ABOVE the neighbouring headings, so the slot collapses when
 * empty and the block finds its own balance.
 */
function ColumnTitleSlot({
    title,
    color,
}: {
    title?: string;
    color: string;
}): JSX.Element | null {
    if (!title) {
        return null;
    }
    return <ColumnTitle color={color}>{title}</ColumnTitle>;
}

function LinksColumnView({
    column,
    textColor,
    hairlineColor,
}: {
    column: LinksColumn;
    textColor: string;
    hairlineColor: string;
}): JSX.Element {
    const links = column.links || [];

    return (
        <div style={{ paddingBottom: `${WIDGET_PADDING_BOTTOM}px` }}>
            <ColumnTitleSlot title={column.title} color={textColor} />
            <ul className="m-0 flex w-full list-none flex-col justify-start p-0">
                {links.map((link, index) => (
                    <li
                        key={link.id}
                        className="relative p-0"
                        style={{
                            borderBottom: `1px solid ${hairlineColor}`,
                            borderTop:
                                index === 0
                                    ? `1px solid ${hairlineColor}`
                                    : undefined,
                        }}
                    >
                        <Link
                            href={link.href}
                            style={{ color: textColor }}
                            className={cn(
                                "relative z-[2] inline-block max-w-full py-[3px] pr-[60px] uppercase no-underline",
                                "transition-opacity duration-100 ease-in",
                                "hover:opacity-80",
                                "focus-visible:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current",
                                /* Not opacity: white text on ocean fades below
                                   AA (4.5:1) once opacity drops under ~76% —
                                   the old active:opacity-60 measured 3.46:1.
                                   A position nudge gives "pressed" feedback
                                   without touching contrast. */
                                "active:translate-y-[1px]",
                            )}
                        >
                            {link.label}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function ContactColumnView({
    column,
    textColor,
}: {
    column: ContactColumn;
    textColor: string;
}): JSX.Element {
    const socials: SocialLink[] = column.socials || [];

    return (
        <div className="text-center">
            <ColumnTitleSlot title={column.title} color={textColor} />
            {column.logoUrl ? (
                // A plain <img>: the footer logo is a fixed-size static
                // asset, not a responsive medialit upload, so the
                // Image wrapper's aspect-video box would be wrong here.
                <img
                    src={column.logoUrl}
                    alt={column.logoAlt || ""}
                    width={column.logoWidth || undefined}
                    height={column.logoHeight || undefined}
                    loading="lazy"
                    decoding="async"
                    className="mx-auto mb-2 h-auto max-w-full"
                    style={{ width: `${column.logoWidth || 150}px` }}
                />
            ) : null}
            {column.heading ? (
                <h3
                    className="text-center normal-case"
                    style={{
                        fontFamily: FONT_BODY,
                        fontSize: `${CONTACT_HEADING_SIZE}px`,
                        fontWeight: 700,
                        color: textColor,
                        margin: 0,
                        padding: 0,
                    }}
                >
                    {column.heading}
                </h3>
            ) : null}
            {column.addressLines && column.addressLines.length > 0 ? (
                <address className="not-italic" style={{ color: textColor }}>
                    {column.addressLines.map((line, index) => (
                        <React.Fragment key={`${column.id}-addr-${index}`}>
                            {line}
                            {index < column.addressLines.length - 1 ? (
                                <br />
                            ) : null}
                        </React.Fragment>
                    ))}
                </address>
            ) : null}
            {column.email ? (
                <p className="m-0" style={{ color: textColor }}>
                    {column.emailLabel ? (
                        <>
                            <strong className="font-bold">
                                {column.emailLabel}
                            </strong>
                            {": "}
                        </>
                    ) : null}
                    <Link
                        href={`mailto:${column.email}`}
                        style={{ color: textColor }}
                        className={cn(
                            "underline underline-offset-2",
                            "transition-opacity duration-100 ease-in",
                            "hover:opacity-80",
                            "focus-visible:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current",
                        )}
                    >
                        {column.email}
                    </Link>
                </p>
            ) : null}
            {socials.length > 0 ? (
                <ul
                    className="m-0 flex list-none flex-wrap items-center justify-center p-0"
                    style={{ marginTop: "15px" }}
                >
                    {socials.map((social) => (
                        <li
                            key={social.id}
                            style={{
                                marginLeft: `${SOCIAL_GAP}px`,
                                marginRight: `${SOCIAL_GAP}px`,
                                marginBottom: `${SOCIAL_GAP}px`,
                            }}
                        >
                            <Link
                                href={social.href}
                                style={{
                                    color: textColor,
                                    borderColor: textColor,
                                    width: `${SOCIAL_BUTTON_SIZE}px`,
                                    height: `${SOCIAL_BUTTON_SIZE}px`,
                                }}
                                className={cn(
                                    "flex items-center justify-center rounded-full border-2 border-solid bg-transparent",
                                    "transition-colors duration-100 ease-in",
                                    "hover:bg-black/10",
                                    "focus-visible:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current",
                                    "active:bg-black/20",
                                )}
                            >
                                <SocialGlyph
                                    platform={social.platform}
                                    size={SOCIAL_GLYPH_SIZE}
                                />
                                <span className="sr-only">
                                    {socialLabels[social.platform]}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

/**
 * Fixed, bottom-right. It is anchored to the viewport corner with a
 * fixed margin rather than positioned from a measured anchor, so it can
 * never spill off-screen or widen the page on any viewport.
 */
function BackToTopControl({
    label,
    revealAfter,
}: {
    label: string;
    revealAfter: number;
}): JSX.Element {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const update = () => setVisible(window.scrollY > revealAfter);
        update();
        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        return () => {
            window.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, [revealAfter]);

    const scrollToTop = useCallback(() => {
        const prefersReducedMotion =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({
            top: 0,
            behavior: prefersReducedMotion ? "auto" : "smooth",
        });
    }, []);

    return (
        <button
            type="button"
            onClick={scrollToTop}
            aria-label={label}
            aria-hidden={!visible}
            tabIndex={visible ? 0 : -1}
            className={cn(
                "fixed bottom-0 right-0 z-[998] box-content flex items-center justify-center rounded-full border-0",
                "bg-white text-[#545454] shadow-md",
                "transition-all duration-200 ease-in-out",
                /* White-on-saffron was 2.14:1 (fails AA); cocoa-on-saffron is
                   7.24:1. Active moves to rust, where white is 7.43:1. */
                "hover:bg-[#ff9900] hover:text-[#312110]",
                "focus-visible:bg-[#ff9900] focus-visible:text-[#312110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]",
                "active:bg-[#993300] active:text-white",
                visible
                    ? "visible opacity-100"
                    : "pointer-events-none invisible opacity-0",
            )}
            style={{
                minWidth: `${BACK_TO_TOP_SIZE}px`,
                minHeight: `${BACK_TO_TOP_SIZE}px`,
                marginRight: `${BACK_TO_TOP_OFFSET}px`,
                marginBottom: `${BACK_TO_TOP_OFFSET}px`,
                fontSize: "16px",
            }}
        >
            <ExpandLess width={16} height={16} aria-hidden="true" />
        </button>
    );
}

export default function Widget({
    settings: {
        columns = defaultColumns,
        groundColor = OCEAN,
        textColor = WHITE,
        hairlineColor = OCEAN_HAIRLINE,
        decorLeftUrl = defaultDecorLeftUrl,
        decorRightUrl = defaultDecorRightUrl,
        innerMaxWidth = INNER_MAX_WIDTH,
        paddingTop = PADDING_TOP,
        paddingBottom = PADDING_BOTTOM,
        copyrightGroundColor = NAVY,
        copyrightPrefix = defaultCopyrightPrefix,
        copyrightOwner = defaultCopyrightOwner,
        copyrightLinkPrefix = defaultCopyrightLinkPrefix,
        copyrightLinkLabel = defaultCopyrightLinkLabel,
        copyrightLinkHref = defaultCopyrightLinkHref,
        backToTop = defaultBackToTop,
        cssId,
    },
    editing,
}: WidgetProps<Settings>) {
    const innerStyle: React.CSSProperties = {
        width: `${innerMaxWidth}px`,
    };

    return (
        <footer
            id={cssId}
            className="w-full"
            style={{
                fontFamily: FONT_BODY,
                fontSize: "14px",
                lineHeight: 1.65,
            }}
        >
            {/* Ocean band. `overflow-hidden` keeps the decorative edges
                from ever producing horizontal page scroll. */}
            <div
                className="relative w-full overflow-hidden"
                style={{ backgroundColor: groundColor, color: textColor }}
            >
                {decorLeftUrl ? (
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 left-0 z-0 max-w-full bg-left bg-no-repeat bg-contain max-[959px]:bg-left-bottom max-[959px]:bg-auto"
                        style={{
                            width: `${DECOR_LEFT_WIDTH}px`,
                            // Quoted: an editor-supplied URL may contain
                            // spaces or parentheses, which break bare url().
                            backgroundImage: `url("${decorLeftUrl}")`,
                        }}
                    />
                ) : null}
                {decorRightUrl ? (
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 right-0 z-0 max-w-full bg-right bg-no-repeat bg-contain max-[959px]:bg-right-top max-[959px]:bg-auto"
                        style={{
                            width: `${DECOR_RIGHT_WIDTH}px`,
                            backgroundImage: `url("${decorRightUrl}")`,
                        }}
                    />
                ) : null}

                <div
                    className="relative z-[1] mx-auto max-w-[90%]"
                    style={{
                        ...innerStyle,
                        paddingTop: `${paddingTop}px`,
                        paddingBottom: `${paddingBottom}px`,
                    }}
                >
                    <div
                        className="grid"
                        style={{
                            gridTemplateColumns: gridTemplateColumns(
                                columns.length,
                            ),
                            columnGap: `${COLUMN_GAP}px`,
                        }}
                    >
                        {columns.map((column: FooterColumn) =>
                            column.kind === "links" ? (
                                <LinksColumnView
                                    key={column.id}
                                    column={column}
                                    textColor={textColor}
                                    hairlineColor={hairlineColor}
                                />
                            ) : (
                                <ContactColumnView
                                    key={column.id}
                                    column={column}
                                    textColor={textColor}
                                />
                            ),
                        )}
                    </div>
                </div>
            </div>

            {/* Navy copyright strip — full bleed, centred. */}
            <div
                className="w-full text-center"
                style={{
                    backgroundColor: copyrightGroundColor,
                    color: WHITE,
                    fontSize: `${COPYRIGHT_FONT_SIZE}px`,
                    lineHeight: `${COPYRIGHT_LINE_HEIGHT}px`,
                }}
            >
                <div
                    className="mx-auto max-w-[90%] pb-[23px] pt-[18px]"
                    style={innerStyle}
                >
                    {copyrightPrefix}{" "}
                    {copyrightOwner ? (
                        <strong className="font-bold">{copyrightOwner}</strong>
                    ) : null}
                    {copyrightLinkLabel ? (
                        <>
                            {" | "}
                            <Link
                                href={copyrightLinkHref}
                                style={{ color: WHITE }}
                                className={cn(
                                    "no-underline",
                                    "transition-opacity duration-100 ease-in",
                                    "hover:opacity-80",
                                    "focus-visible:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current",
                                )}
                            >
                                {copyrightLinkPrefix
                                    ? `${copyrightLinkPrefix} `
                                    : ""}
                                <strong className="font-bold">
                                    {copyrightLinkLabel}
                                </strong>
                            </Link>
                        </>
                    ) : null}
                </div>
            </div>

            {/* Suppressed inside the page editor: a viewport-fixed control
                would float over the editing canvas. */}
            {backToTop.enabled && !editing ? (
                <BackToTopControl
                    // Fallbacks: settings are JSON, so an enabled control can
                    // arrive without its copy. An unlabelled icon-only button
                    // is invisible to screen readers.
                    label={backToTop.label || "Back To Top"}
                    revealAfter={
                        Number.isFinite(backToTop.revealAfter)
                            ? backToTop.revealAfter
                            : 100
                    }
                />
            ) : null}
        </footer>
    );
}
