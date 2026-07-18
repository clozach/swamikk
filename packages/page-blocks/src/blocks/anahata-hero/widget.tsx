import React from "react";
import { WidgetProps } from "@courselit/common-models";
import { Link } from "@courselit/components-library";
import { Section } from "@courselit/page-primitives";
import { ThemeStyle } from "@courselit/page-models";
import clsx from "clsx";
import Settings, {
    CtaStyle,
    HeroImage,
    HeroParagraph,
    ImageSource,
} from "./settings";
import * as defaults from "./defaults";

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

/** The §0.6 button recipe, one class list per real stylesheet variant. */
const ctaBaseClasses = clsx(
    "inline-block text-center capitalize font-bold font-open-sans",
    "min-w-[200px] rounded-[10px] border-0 cursor-pointer no-underline",
    "transition-colors duration-100 ease-in",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#993300]",
    "active:bg-[#7a2900] active:translate-y-[1px]",
);

const ctaVariantClasses: Record<CtaStyle, string> = {
    saffron:
        "bg-[#ff9900] text-white hover:bg-[#993300] hover:text-white text-[14px] px-[23px] py-[8px]",
    "saffron-big":
        "bg-[#ff9900] text-white hover:bg-[#993300] hover:text-white text-[16px] px-[45px] py-[16px]",
    white: "bg-white text-[#ff9900] hover:bg-[#993300] hover:text-white text-[14px] px-[23px] py-[8px]",
};

export default function Widget({
    settings: {
        bannerImage = defaults.bannerImage,
        bannerFit = defaults.bannerFit,
        bannerPosition = defaults.bannerPosition,
        bannerAspectRatio = defaults.bannerAspectRatio,
        bannerMinHeight = defaults.bannerMinHeight,
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

    return (
        <div
            id={cssId}
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
                <div
                    className={clsx(
                        "relative w-full overflow-hidden",
                        /* An arbitrary duration utility is ambiguous under
                           tailwindcss-animate (it matches both the
                           transition and animation scales) and silently
                           fails to compile, so the animation duration is
                           written as a bare CSS property instead. */
                        animation === "fade" &&
                            "animate-in fade-in [animation-duration:600ms] motion-reduce:animate-none",
                    )}
                    /* An empty alt marks the band decorative; a non-empty one
                       has to be exposed as an image role, because a CSS
                       background carries no implicit img semantics. */
                    role={bannerImage.alt ? "img" : undefined}
                    aria-label={bannerImage.alt || undefined}
                    style={{
                        aspectRatio: bannerAspectRatio,
                        minHeight: `${bannerMinHeight}px`,
                        backgroundImage: `url("${bannerSrc}")`,
                        backgroundSize: bannerFit,
                        backgroundPosition: bannerPosition,
                        backgroundRepeat: "no-repeat",
                        backgroundColor: groundColor,
                    }}
                >
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
                                style={{ maxWidth: `${wordmarkMaxWidth}px` }}
                            />
                        </div>
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
