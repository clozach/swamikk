"use client";

import React, { useLayoutEffect, useMemo, useRef } from "react";
import { WidgetProps } from "@courselit/common-models";
import { Link } from "@courselit/components-library";
import { Section } from "@courselit/page-primitives";
import { ThemeStyle } from "@courselit/page-models";
import clsx from "clsx";
import Settings, { CtaStyle, HeroImage, HeroParagraph } from "./settings";
import * as defaults from "./defaults";
import SharedImage, { sharedImageCss, staticImageCss } from "./shared-image";
import { useImageScroll } from "./use-image-scroll";
import {
    hasWell,
    isWaiting,
    resolveImageSrc,
} from "../../components/image-source";
import { PALETTE } from "../../components/palette";

/** CSS-safe scope token derived from the widget instance id (stable across SSR). */
function toScope(id: string | undefined): string {
    const cleaned = (id || "").replace(/[^A-Za-z0-9_-]/g, "");
    return cleaned.length ? cleaned : "default";
}

/**
 * Fallback header heights (px) per breakpoint, read off the Anahata header
 * block's own source (topbar row + logo row + nav rows + its 7px of
 * borders). These only paint for a moment — before hydration, or if no
 * `<header>` exists on the page — because `useHeaderHeightVar` below
 * overwrites the custom property with the header's true, live-measured
 * height the instant it can. The 768–1139px bucket is the least certain of
 * the four: the header's nav wraps onto extra 50px rows there depending on
 * exact width, which is exactly the "not fixed-height" problem this whole
 * mechanism exists to solve — the fallback is deliberately generous (fewer
 * chances of the banner rendering taller than the header, momentarily) and
 * gets corrected within a frame.
 */
const HEADER_HEIGHT_FALLBACK_PX = {
    base: 150, // <560px: no topbar, logo row + mobile bar
    topBar: 190, // 560–767px: topbar appears, still no desktop nav
    stacked: 230, // 768–1139px: topbar + logo row + wrapped nav row(s)
    inline: 145, // >=1140px: topbar + single logo/nav row
} as const;

/**
 * Measures the page's `<header>` and republishes its live height as a CSS
 * custom property on `el`, so `calc(100svh - var(--anahata-hero-header-h))`
 * always subtracts the header's REAL rendered height rather than a guess.
 *
 * This lives in the hero block (not the header block) because the task is
 * scoped to editing only this directory — the header can't be changed to
 * publish its own height. A `ResizeObserver` on the header element is the
 * next best thing: it catches every reason the header's height can change
 * (viewport resize, its nav wrapping onto another row, a late-settling web
 * font reflowing text, the admin toggling `showTopBar`) without polling.
 */
function useHeaderHeightVar(
    ref: React.RefObject<HTMLElement | null>,
    enabled: boolean,
): void {
    useLayoutEffect(() => {
        // Read `.current` inside the effect, not as a render-time argument:
        // on first mount the ref attaches during commit, after this render's
        // hook call has already read it — reading it here instead means the
        // effect always sees the real, attached element.
        const el = ref.current;
        if (!enabled || !el || typeof window === "undefined") {
            return;
        }

        const header = document.querySelector<HTMLElement>("header");

        const apply = () => {
            // No header on this page at all → don't subtract a guess, use
            // the full viewport.
            const height = header
                ? Math.ceil(header.getBoundingClientRect().height)
                : 0;
            el.style.setProperty("--anahata-hero-header-h", `${height}px`);
        };

        apply();
        // Web fonts can settle a frame late and reflow the header's nav
        // onto a different number of rows.
        const frame = requestAnimationFrame(apply);

        let observer: ResizeObserver | undefined;
        if (header && typeof ResizeObserver !== "undefined") {
            observer = new ResizeObserver(apply);
            observer.observe(header);
        } else {
            window.addEventListener("resize", apply);
        }

        return () => {
            cancelAnimationFrame(frame);
            observer?.disconnect();
            window.removeEventListener("resize", apply);
        };
        // `ref` (the object, not `.current`) is stable across renders, so
        // this effect only re-runs when `enabled` actually changes — it does
        // not need to and must not depend on `ref.current`.
    }, [ref, enabled]);
}

/** A picture's resolved URL, or "" — placeholders resolve to nothing. */
const srcOf = (image?: HeroImage): string =>
    resolveImageSrc(image?.source) ?? "";

/** The well text when the picture is a placeholder, else undefined. */
const waitingText = (image?: HeroImage): string | undefined => {
    const source = image?.source;
    return isWaiting(source) ? source.description : undefined;
};

/**
 * Split a paragraph around its inline link. Falls back to plain text whenever
 * the link is incompletely specified or its text is not actually present, so
 * a half-configured link can never render as an empty or misplaced anchor.
 */
function ParagraphBody({
    paragraph,
}: {
    paragraph: HeroParagraph;
}): JSX.Element {
    const { text, linkText, linkHref } = paragraph;

    if (!linkText || !linkHref) {
        return <>{text}</>;
    }

    const start = text.indexOf(linkText);
    if (start === -1) {
        return <>{text}</>;
    }

    return (
        <>
            {text.slice(0, start)}
            <Link
                href={linkHref}
                className={clsx(
                    /* Always underlined: pine against ink is 1.5:1, so
                       colour alone could never carry a link. Colours come
                       from custom properties set on the block root, so they
                       stay settings-driven while still allowing a pure-CSS
                       :hover (an inline style could not). */
                    "underline decoration-1 underline-offset-[0.16em] rounded-sm",
                    "text-[var(--anahata-link)] hover:text-[var(--anahata-link-hover)] hover:decoration-2 active:text-[var(--anahata-link-hover)]",
                    "transition-colors duration-100 ease-in",
                    "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[var(--anahata-link)]",
                )}
            >
                {linkText}
            </Link>
            {text.slice(start + linkText.length)}
        </>
    );
}

/**
 * Block-scoped CSS painted from the v1.0 palette. Plain classes rather than
 * Tailwind arbitrary values because these colours are constants, and the
 * hover / active / focus states have to be written out explicitly: a
 * keyboard Enter/Space press triggers `:active` without `:hover`, so every
 * pressed state names its own colours instead of inheriting hover's. Only
 * links and buttons react to hover — nothing else in the hero does.
 */
const heroCss = `
.anahata-hero__offerings li + li::before {
    content: "·"; margin-right: 0.7em; color: ${PALETTE.edge};
}
.anahata-hero__button {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 48px; padding: 11px 22px;
    border: 1.5px solid transparent; border-radius: 6px;
    font-weight: 700; font-size: 16px; line-height: 1.2;
    text-align: center; text-decoration: none; cursor: pointer;
    transition: background-color 100ms ease-in, color 100ms ease-in, border-color 100ms ease-in;
}
.anahata-hero__button:hover, .anahata-hero__button:active { text-decoration: none; }
.anahata-hero__button:focus-visible {
    outline: 3px solid ${PALETTE.pine}; outline-offset: 3px;
}
.anahata-hero__button--pine {
    background: ${PALETTE.pine}; border-color: ${PALETTE.pine}; color: ${PALETTE.bone};
}
.anahata-hero__button--pine:hover {
    background: ${PALETTE.pineDeep}; border-color: ${PALETTE.pineDeep}; color: ${PALETTE.bone};
}
.anahata-hero__button--pine:active {
    background: ${PALETTE.pineDeep}; border-color: ${PALETTE.pineDeep}; color: ${PALETTE.bone};
    transform: translateY(1px);
}
.anahata-hero__button--moss {
    background: ${PALETTE.moss}; border-color: ${PALETTE.pine}; color: ${PALETTE.ink};
}
.anahata-hero__button--moss:hover {
    background: ${PALETTE.pineDeep}; border-color: ${PALETTE.pineDeep}; color: ${PALETTE.bone};
}
.anahata-hero__button--moss:active {
    background: ${PALETTE.pineDeep}; border-color: ${PALETTE.pineDeep}; color: ${PALETTE.bone};
    transform: translateY(1px);
}
.anahata-hero__button--outline {
    background: ${PALETTE.card}; border-color: ${PALETTE.pine}; color: ${PALETTE.pine};
}
.anahata-hero__button--outline:hover {
    background: ${PALETTE.pine}; border-color: ${PALETTE.pine}; color: ${PALETTE.bone};
}
.anahata-hero__button--outline:active {
    background: ${PALETTE.pineDeep}; border-color: ${PALETTE.pineDeep}; color: ${PALETTE.bone};
    transform: translateY(1px);
}
.anahata-hero__button--large { padding: 16px 45px; }
@media (max-width: 767.98px) {
    .anahata-hero__actions .anahata-hero__button { flex: 1 1 100%; }
}
`;

/**
 * Recipe per `CtaStyle`. The three Anahata names map onto the new recipes
 * so a stored layout keeps rendering, but nothing paints the old palette.
 */
const ctaVariantClasses: Record<CtaStyle, string> = {
    pine: "anahata-hero__button--pine",
    moss: "anahata-hero__button--moss",
    saffron: "anahata-hero__button--pine",
    "saffron-big": "anahata-hero__button--pine anahata-hero__button--large",
    white: "anahata-hero__button--outline",
};

export default function Widget({
    id,
    settings: {
        bannerImage = defaults.bannerImage,
        bannerFit = defaults.bannerFit,
        bannerPosition = defaults.bannerPosition,
        bannerHeightMode = defaults.bannerHeightMode,
        bannerAspectRatio = defaults.bannerAspectRatio,
        bannerMinHeight = defaults.bannerMinHeight,
        bannerMode = defaults.bannerMode,
        wordmark = defaults.wordmark,
        wordmarkMaxWidth = defaults.wordmarkMaxWidth,
        animation = defaults.animation,
        kicker = defaults.kicker,
        heading = defaults.heading,
        offerings = defaults.offerings,
        paragraphs = defaults.paragraphs,
        ledeParagraphIndex = defaults.ledeParagraphIndex,
        photo = defaults.photo,
        photoPosition = defaults.photoPosition,
        photoOffsetTop = defaults.photoOffsetTop,
        ctaCaption = defaults.ctaCaption,
        ctaAction = defaults.ctaAction,
        ctaStyle = defaults.ctaStyle,
        secondaryCtaCaption = defaults.secondaryCtaCaption,
        secondaryCtaAction = defaults.secondaryCtaAction,
        groundColor = defaults.groundColor,
        headingColor = defaults.headingColor,
        bodyColor = defaults.bodyColor,
        linkColor = defaults.linkColor,
        linkHoverColor = defaults.linkHoverColor,
        cssId,
        verticalPadding,
        maxWidth,
        background,
    },
    state: { theme },
    nextTheme,
    editing,
}: WidgetProps<Settings>) {
    const overiddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
    overiddenTheme.structure.page.width =
        maxWidth || theme.theme.structure.page.width;
    overiddenTheme.structure.section.padding.y =
        verticalPadding || theme.theme.structure.section.padding.y;

    /* One frame, banner first (README § Shared homepage image): the banner
       — a URL, a library item, or a well — starts over the cover band and
       scrolls into the 3:2 column; the welcome photo is the frame's content
       only when no banner is set. A well counts as content: its whole point
       is to be judged in the real box. */
    const bannerWell = hasWell(bannerImage?.source);
    const frameImage: HeroImage = bannerWell ? bannerImage : photo;
    const frameWell = hasWell(frameImage?.source);
    const showCta = Boolean(ctaCaption && ctaAction);
    const showSecondaryCta = Boolean(secondaryCtaCaption && secondaryCtaAction);
    const isFullScreenBanner = bannerHeightMode === "full-screen";
    const offeringWords = (offerings ?? []).filter(
        (word) => typeof word === "string" && word.trim(),
    );

    const scope = useMemo(() => toScope(id), [id]);
    const rootRef = useRef<HTMLDivElement>(null);
    const bannerRef = useRef<HTMLDivElement>(null);
    const destinationRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLDivElement>(null);
    useHeaderHeightVar(rootRef, isFullScreenBanner && bannerWell);
    useImageScroll(
        {
            root: rootRef,
            cover: bannerRef,
            destination: destinationRef,
            image: imageRef,
        },
        !editing && bannerWell,
    );

    /* Two `height` declarations, not one: a browser that doesn't understand
       `100svh` treats the whole second declaration as invalid and ignores
       it, leaving the `100vh` line from just above in effect — no
       `@supports` block needed. Breakpoints match the header's own
       (560px topbar, 768px = md nav, 1140px = single-row nav) so the
       fallback bucket boundaries line up with where the header's real
       height actually steps. */
    const fullScreenBannerCss = isFullScreenBanner
        ? `
[data-anahata-hero="${scope}"] .anahata-hero__banner--full-screen {
    height: calc(100vh - var(--anahata-hero-header-h, ${HEADER_HEIGHT_FALLBACK_PX.base}px));
    height: calc(100svh - var(--anahata-hero-header-h, ${HEADER_HEIGHT_FALLBACK_PX.base}px));
}
@media (min-width: 560px) {
    [data-anahata-hero="${scope}"] .anahata-hero__banner--full-screen {
        height: calc(100vh - var(--anahata-hero-header-h, ${HEADER_HEIGHT_FALLBACK_PX.topBar}px));
        height: calc(100svh - var(--anahata-hero-header-h, ${HEADER_HEIGHT_FALLBACK_PX.topBar}px));
    }
}
@media (min-width: 768px) {
    [data-anahata-hero="${scope}"] .anahata-hero__banner--full-screen {
        height: calc(100vh - var(--anahata-hero-header-h, ${HEADER_HEIGHT_FALLBACK_PX.stacked}px));
        height: calc(100svh - var(--anahata-hero-header-h, ${HEADER_HEIGHT_FALLBACK_PX.stacked}px));
    }
}
@media (min-width: 1140px) {
    [data-anahata-hero="${scope}"] .anahata-hero__banner--full-screen {
        height: calc(100vh - var(--anahata-hero-header-h, ${HEADER_HEIGHT_FALLBACK_PX.inline}px));
        height: calc(100svh - var(--anahata-hero-header-h, ${HEADER_HEIGHT_FALLBACK_PX.inline}px));
    }
}
`
        : "";

    return (
        <div
            ref={rootRef}
            data-image-motion="static"
            id={cssId}
            data-anahata-hero={scope}
            className="anahata-hero w-full"
            style={
                {
                    backgroundColor: groundColor,
                    "--anahata-link": linkColor,
                    "--anahata-link-hover": linkHoverColor,
                    "--anahata-cover-h":
                        "max(220px, calc(100svh - var(--anahata-hero-header-h, 150px)))",
                } as React.CSSProperties
            }
        >
            <style>
                {sharedImageCss}
                {heroCss}
                {fullScreenBannerCss}
            </style>
            <noscript
                dangerouslySetInnerHTML={{
                    __html: `<style>${staticImageCss.split('[data-image-motion="static"]').join("")}</style>`,
                }}
            />
            {bannerWell && (
                <div
                    ref={bannerRef}
                    aria-hidden="true"
                    className={clsx(
                        "anahata-hero__cover w-full",
                        isFullScreenBanner &&
                            "anahata-hero__banner--full-screen",
                    )}
                    style={{
                        ...(isFullScreenBanner
                            ? {}
                            : { aspectRatio: bannerAspectRatio }),
                        minHeight: `${bannerMinHeight}px`,
                    }}
                />
            )}

            <Section
                theme={overiddenTheme}
                background={background}
                nextTheme={nextTheme as "dark" | "light"}
                className="anahata-hero__welcome bg-transparent"
            >
                {/* Text first in the DOM so phones read heading → copy →
                    photo; `photoPosition` only decides the md+ order. The
                    scroll hook reads this row's flex-direction, and accepts
                    both `row` and `row-reverse`. */}
                <div
                    className={clsx(
                        "flex flex-col gap-y-8 md:items-center md:gap-x-16",
                        photoPosition === "left"
                            ? "md:flex-row-reverse"
                            : "md:flex-row",
                    )}
                >
                    <div
                        className={clsx(
                            "relative z-[2] w-full min-w-0",
                            frameWell ? "md:w-[55%]" : "md:w-full",
                        )}
                        style={{ backgroundColor: groundColor }}
                    >
                        {kicker && (
                            <p
                                className="font-open-sans font-semibold text-[13px] leading-[1.4] tracking-[0.14em] uppercase mt-0 mb-3"
                                style={{ color: PALETTE.inkSoft }}
                            >
                                {kicker}
                            </p>
                        )}
                        {heading && (
                            <h1
                                className="font-playfair-display font-bold text-[clamp(36px,4.4vw,54px)] leading-[1.08] tracking-[-0.012em] m-0"
                                style={{ color: headingColor }}
                            >
                                {heading}
                            </h1>
                        )}
                        {offeringWords.length > 0 && (
                            <ul
                                className="anahata-hero__offerings flex flex-wrap gap-x-[0.7em] list-none m-0 p-0 mt-[18px] mb-8 font-open-sans font-semibold text-[13px] leading-[1.8] tracking-[0.12em] uppercase"
                                style={{ color: headingColor }}
                            >
                                {offeringWords.map((word, index) => (
                                    <li key={`${index}-${word}`}>{word}</li>
                                ))}
                            </ul>
                        )}
                        {paragraphs.map((paragraph, index) => {
                            const lede = index === ledeParagraphIndex;
                            return (
                                <p
                                    key={`${index}-${paragraph.text.slice(0, 24)}`}
                                    className={clsx(
                                        "text-left max-w-[58ch]",
                                        lede
                                            ? "font-playfair-display text-[1.4rem] leading-[1.4] mt-[1.2em] mb-4"
                                            : "font-open-sans text-[16px] leading-[1.65] mt-0 mb-4",
                                    )}
                                    style={{
                                        color: lede ? headingColor : bodyColor,
                                    }}
                                >
                                    <ParagraphBody paragraph={paragraph} />
                                </p>
                            );
                        })}
                        {(showCta || showSecondaryCta) && (
                            <div className="anahata-hero__actions flex flex-wrap gap-3 mt-9">
                                {showCta && (
                                    <Link
                                        href={ctaAction}
                                        className={clsx(
                                            "anahata-hero__button font-open-sans",
                                            ctaVariantClasses[ctaStyle] ??
                                                ctaVariantClasses.pine,
                                        )}
                                    >
                                        {ctaCaption}
                                    </Link>
                                )}
                                {showSecondaryCta && (
                                    <Link
                                        href={secondaryCtaAction}
                                        className="anahata-hero__button anahata-hero__button--moss font-open-sans"
                                    >
                                        {secondaryCtaCaption}
                                    </Link>
                                )}
                            </div>
                        )}
                    </div>
                    {frameWell && (
                        <div
                            ref={destinationRef}
                            className="anahata-hero__image-slot w-full min-w-0 md:w-[45%] md:mt-[var(--anahata-photo-offset)]"
                            style={
                                {
                                    "--anahata-photo-offset": `${photoOffsetTop}px`,
                                } as React.CSSProperties
                            }
                        >
                            <SharedImage
                                frameRef={imageRef}
                                source={srcOf(frameImage)}
                                placeholder={waitingText(frameImage)}
                                alt={frameImage.alt}
                                fit={bannerFit}
                                position={bannerPosition}
                                mode={
                                    bannerWell ? bannerMode : { kind: "static" }
                                }
                                wordmark={wordmark}
                                wordmarkSrc={srcOf(wordmark)}
                                wordmarkPlaceholder={waitingText(wordmark)}
                                wordmarkWidth={wordmarkMaxWidth}
                                editing={editing}
                                animation={animation}
                            />
                        </div>
                    )}
                </div>
            </Section>
        </div>
    );
}
