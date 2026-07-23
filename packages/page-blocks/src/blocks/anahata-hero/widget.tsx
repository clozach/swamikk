"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { WidgetProps } from "@courselit/common-models";
import { Link } from "@courselit/components-library";
import { Section } from "@courselit/page-primitives";
import { ThemeStyle } from "@courselit/page-models";
import clsx from "clsx";
import Settings, {
    BannerMode,
    CtaStyle,
    HeroImage,
    HeroParagraph,
    ImageSource,
} from "./settings";
import * as defaults from "./defaults";
import { useSocialRotation } from "./use-social-rotation";
import { NetworkGlyph, networkLabel } from "./network-glyph";

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
    useEffect(() => {
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

/**
 * Resolve a picture to a `src`. The tagged union means there is exactly one
 * place a URL can come from, so there is no precedence rule to get wrong.
 * Settings loaded from the database predate nothing, but they can still be
 * malformed by hand, hence the defensive `source` check.
 */
function resolveImageSrc(image?: HeroImage): string {
    const source: ImageSource | undefined = image?.source;
    if (!source) {
        return "";
    }
    if (source.kind === "media") {
        return source.media?.file || source.media?.thumbnail || "";
    }
    return source.url || "";
}

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
                    "font-semibold underline-offset-2 rounded-sm",
                    /* Colours come from custom properties set on the block
                       root, so they stay settings-driven while still allowing
                       a pure-CSS :hover (an inline style could not). */
                    "text-[var(--anahata-link)] hover:text-[var(--anahata-link-hover)] hover:underline",
                    "transition-colors duration-100 ease-in",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--anahata-link-hover)]",
                )}
            >
                {linkText}
            </Link>
            {text.slice(start + linkText.length)}
        </>
    );
}

/**
 * The §0.6 button recipe, one class list per real stylesheet variant.
 *
 * White text on the saffron ground was 2.14:1 — under the 4.5:1 floor —
 * so the rest state now pairs saffron with cocoa (7.24:1). Hover/active
 * darken the ground to rust/rust-pressed, which both carry white text
 * comfortably (7.43:1 / 9.79:1); `active:text-white` is set explicitly
 * (not inherited from `:hover`) because a keyboard Enter/Space press
 * triggers `:active` without `:hover`, and cocoa-on-rust-pressed is only
 * 1.58:1 — the missed-state case the spec warns about.
 */
const ctaBaseClasses = clsx(
    "inline-block text-center capitalize font-bold font-open-sans",
    "min-w-[200px] rounded-[10px] border-0 cursor-pointer no-underline",
    "transition-colors duration-100 ease-in",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]",
    "active:bg-[#7a2900] active:text-white active:translate-y-[1px]",
);

const ctaVariantClasses: Record<CtaStyle, string> = {
    saffron:
        "bg-[#ff9900] text-[#312110] hover:bg-[#993300] hover:text-white text-[14px] px-[23px] py-[8px]",
    "saffron-big":
        "bg-[#ff9900] text-[#312110] hover:bg-[#993300] hover:text-white text-[16px] px-[45px] py-[16px]",
    /* White ground: rust text at rest (7.43:1) — saffron text there was
       2.14:1 and never qualified even at this size. */
    white: "bg-white text-[#993300] hover:bg-[#993300] hover:text-white text-[14px] px-[23px] py-[8px]",
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
        heading = defaults.heading,
        paragraphs = defaults.paragraphs,
        photo = defaults.photo,
        photoOffsetTop = defaults.photoOffsetTop,
        ctaCaption = defaults.ctaCaption,
        ctaAction = defaults.ctaAction,
        ctaStyle = defaults.ctaStyle,
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
}: WidgetProps<Settings>) {
    const overiddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
    overiddenTheme.structure.page.width =
        maxWidth || theme.theme.structure.page.width;
    overiddenTheme.structure.section.padding.y =
        verticalPadding || theme.theme.structure.section.padding.y;

    const bannerSrc = resolveImageSrc(bannerImage);
    const wordmarkSrc = resolveImageSrc(wordmark);
    const photoSrc = resolveImageSrc(photo);
    const showCta = Boolean(ctaCaption && ctaAction);
    const isFullScreenBanner = bannerHeightMode === "full-screen";

    const scope = useMemo(() => toScope(id), [id]);
    const bannerRef = useRef<HTMLDivElement | null>(null);
    useHeaderHeightVar(bannerRef, isFullScreenBanner && Boolean(bannerSrc));

    /* Social rotation, opt-in per block. When active but the pool isn't ready
       (fetching, empty, disabled, or unreachable) we fall straight back to the
       stored static banner — the hero is never blank or broken by a feed. */
    const rotation = useSocialRotation(bannerMode.kind === "social-rotation");
    const rotationActive =
        bannerMode.kind === "social-rotation" && rotation.ready;
    /* In rotation the a11y name follows the current photo's caption; otherwise
       it's the stored banner's alt (empty = decorative, as before). */
    const bannerAlt = rotationActive
        ? (rotation.current?.alt ?? "")
        : bannerImage.alt;

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
            id={cssId}
            data-anahata-hero={scope}
            className="anahata-hero w-full"
            style={
                {
                    backgroundColor: groundColor,
                    "--anahata-link": linkColor,
                    "--anahata-link-hover": linkHoverColor,
                } as React.CSSProperties
            }
        >
            {bannerSrc && (
                /* `group` so the overlay button can reveal on band hover; the
                   button is a SIBLING AFTER the banner div (not a child) so it
                   is not swallowed by the div's `role="img"` subtree and reads
                   AFTER the image description (§4). */
                <div className="relative group">
                    <div
                        ref={bannerRef}
                        className={clsx(
                            "relative w-full overflow-hidden",
                            isFullScreenBanner &&
                                "anahata-hero__banner--full-screen",
                            /* An arbitrary duration utility is ambiguous under
                               tailwindcss-animate (it matches both the
                               transition and animation scales) and silently
                               fails to compile, so the animation duration is
                               written as a bare CSS property instead. */
                            animation === "fade" &&
                                "animate-in fade-in [animation-duration:600ms] motion-reduce:animate-none",
                        )}
                        /* An empty alt marks the band decorative; a non-empty
                           one has to be exposed as an image role, because a CSS
                           background carries no implicit img semantics. In
                           rotation the label tracks the current photo. */
                        role={bannerAlt ? "img" : undefined}
                        aria-label={bannerAlt || undefined}
                        style={{
                            /* "fixed" mode sizes the band off its own width via
                               aspect-ratio; "full-screen" mode sets an explicit
                               height (the CSS above), which makes aspect-ratio a
                               no-op anyway, but omitting it here keeps the
                               applied style honest about which mode is live. */
                            ...(isFullScreenBanner
                                ? {}
                                : { aspectRatio: bannerAspectRatio }),
                            minHeight: `${bannerMinHeight}px`,
                            backgroundImage: `url("${bannerSrc}")`,
                            backgroundSize: bannerFit,
                            backgroundPosition: bannerPosition,
                            backgroundRepeat: "no-repeat",
                            backgroundColor: groundColor,
                        }}
                    >
                        {isFullScreenBanner && (
                            <style>{fullScreenBannerCss}</style>
                        )}
                        {/* Two crossfading layers over the static banner (which
                            stays as the underlay + permanent fallback). The
                            next image is preloaded before the swap, so a
                            half-loaded hero never paints; reduced-motion
                            freezes on frame 0 (no transition). */}
                        {rotationActive && (
                            <>
                                <div
                                    aria-hidden="true"
                                    className="absolute inset-0 bg-no-repeat transition-opacity duration-700 ease-in-out motion-reduce:transition-none"
                                    style={{
                                        backgroundImage: `url("${rotation.layerA}")`,
                                        backgroundSize: bannerFit,
                                        backgroundPosition: bannerPosition,
                                        opacity: rotation.showA ? 1 : 0,
                                    }}
                                />
                                <div
                                    aria-hidden="true"
                                    className="absolute inset-0 bg-no-repeat transition-opacity duration-700 ease-in-out motion-reduce:transition-none"
                                    style={{
                                        backgroundImage: rotation.layerB
                                            ? `url("${rotation.layerB}")`
                                            : undefined,
                                        backgroundSize: bannerFit,
                                        backgroundPosition: bannerPosition,
                                        opacity: rotation.showA ? 0 : 1,
                                    }}
                                />
                            </>
                        )}
                        {wordmarkSrc && (
                            /* Flex-centred rather than offset-positioned, and
                               capped on BOTH axes, so the wordmark can never
                               overflow the band or widen the page. */
                            <div className="absolute inset-0 flex items-center justify-center px-[5%] py-[5%]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={wordmarkSrc}
                                    alt={wordmark.alt}
                                    className="w-full h-auto max-h-full object-contain"
                                    style={{
                                        maxWidth: `${wordmarkMaxWidth}px`,
                                    }}
                                />
                            </div>
                        )}
                    </div>
                    {/* Source-post link. Real anchor, in DOM AFTER the banner
                        (so SR reads image → link). Hidden at rest; revealed on
                        band hover AND on its own keyboard focus (an invisible
                        focus target is a WCAG 2.4.7 failure); kept faintly
                        visible on coarse pointers, which have no hover. Never
                        display:none, so it stays focusable. */}
                    {rotationActive && rotation.current && (
                        <a
                            href={rotation.current.postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={clsx(
                                "absolute bottom-4 right-4 z-10 inline-flex items-center gap-2",
                                "rounded-[10px] bg-white text-[#993300] no-underline shadow-md",
                                "px-[16px] py-[8px] text-[14px] font-bold font-open-sans",
                                "hover:bg-[#993300] hover:text-white",
                                "transition-opacity duration-200 ease-in motion-reduce:transition-none",
                                "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                                "[@media(pointer:coarse)]:opacity-90",
                                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]",
                            )}
                        >
                            <NetworkGlyph
                                domain={rotation.current.networkDomain}
                                className="text-[1.1em]"
                            />
                            <span>
                                View this photo on{" "}
                                {networkLabel(rotation.current.networkDomain)}
                            </span>
                        </a>
                    )}
                </div>
            )}

            <Section
                theme={overiddenTheme}
                background={background}
                nextTheme={nextTheme as "dark" | "light"}
                className="bg-transparent"
            >
                <div className="flex flex-col md:flex-row md:gap-x-[35px] gap-y-8">
                    {photoSrc && (
                        /* `min-w-0` defeats the flex `min-width: auto` floor:
                           two 50% columns plus a 35px gap exceed 100%, and
                           without it a wide child could push the row — and the
                           page — past the viewport. */
                        <div className="w-full min-w-0 md:w-1/2">
                            {/* The two 32px spacers of the original sit above
                                the photo on desktop only; on mobile the column
                                stacks and the offset would read as dead space. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={photoSrc}
                                alt={photo.alt}
                                loading="lazy"
                                className="block w-full h-auto md:mt-[var(--anahata-photo-offset)]"
                                style={
                                    {
                                        "--anahata-photo-offset": `${photoOffsetTop}px`,
                                    } as React.CSSProperties
                                }
                            />
                        </div>
                    )}
                    <div
                        className={clsx(
                            "w-full min-w-0",
                            photoSrc ? "md:w-1/2" : "md:w-full",
                        )}
                    >
                        {heading && (
                            <h2
                                className="font-playfair-display text-[32px] font-normal leading-[1.2] text-left pb-[15px] mt-0"
                                style={{ color: headingColor }}
                            >
                                {heading}
                            </h2>
                        )}
                        {paragraphs.map((paragraph, index) => (
                            <p
                                key={`${index}-${paragraph.text.slice(0, 24)}`}
                                className={clsx(
                                    "font-open-sans text-[14px] leading-[1.65] text-left",
                                    index === paragraphs.length - 1
                                        ? "mb-[30px]"
                                        : "mb-[1.5em]",
                                )}
                                style={{ color: bodyColor }}
                            >
                                <ParagraphBody paragraph={paragraph} />
                            </p>
                        ))}
                        {showCta && (
                            <Link
                                href={ctaAction}
                                className={clsx(
                                    ctaBaseClasses,
                                    ctaVariantClasses[ctaStyle],
                                )}
                            >
                                {ctaCaption}
                            </Link>
                        )}
                    </div>
                </div>
            </Section>
        </div>
    );
}
