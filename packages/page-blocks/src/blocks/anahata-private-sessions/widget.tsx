import React from "react";
import clsx from "clsx";
import { WidgetProps } from "@courselit/common-models";
import { Section } from "@courselit/page-primitives";
import { ThemeStyle } from "@courselit/page-models";
import Settings, { Bullet, resolveImageSource } from "./settings";
import * as defaults from "./defaults";

/**
 * Anahata "Private Sessions" callout.
 *
 * Source of truth: the visual spec's Section 5 (`div.vc_row.block-image-testimonial`
 * in the real site's child theme). Photograph on a marigold ground beside a rust
 * lead line, the six bullets, and the saffron button.
 *
 * Colours arrive as settings, so they are threaded through CSS custom properties
 * rather than Tailwind literals — that keeps `hover:`/`focus-visible:`/`active:`
 * working (an inline `style` cannot express them) while still letting Karuna
 * repaint the block from the page builder.
 */
export default function Widget({
    settings: {
        photo = defaults.photo,
        photoAlt = defaults.photoAlt,
        photoWidth = defaults.photoWidth,
        photoHeight = defaults.photoHeight,
        decorImage = defaults.decorImage,
        showDecorImage = defaults.showDecorImage,
        lead = defaults.lead,
        bullets,
        buttonCaption = defaults.buttonCaption,
        buttonAction = defaults.buttonAction,
        buttonOpensInNewTab = defaults.buttonOpensInNewTab,
        panelColor = defaults.panelColor,
        leadColor = defaults.leadColor,
        textColor = defaults.textColor,
        buttonColor = defaults.buttonColor,
        buttonHoverColor = defaults.buttonHoverColor,
        buttonTextColor = defaults.buttonTextColor,
        buttonHoverTextColor = defaults.buttonHoverTextColor,
        photoPosition = defaults.photoPosition,
        cssId,
        verticalPadding,
        maxWidth,
        background,
    },
    state: { theme },
    editing,
    nextTheme,
}: WidgetProps<Settings>) {
    const overiddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
    overiddenTheme.structure.page.width =
        maxWidth || defaults.maxWidth || theme.theme.structure.page.width;
    overiddenTheme.structure.section.padding.y =
        verticalPadding ||
        defaults.verticalPadding ||
        theme.theme.structure.section.padding.y;

    const photoUrl = resolveImageSource(photo);
    const decorUrl = showDecorImage
        ? resolveImageSource(decorImage)
        : undefined;

    // `undefined` means "never edited" -> seed the Anahata defaults. An empty
    // array is a deliberate edit (Karuna deleted every bullet) and must be
    // honoured, otherwise the deletion silently reverts on the rendered page.
    const items: Bullet[] =
        bullets ??
        defaults.bulletTexts.map((text, index) => ({
            id: `default-${index}`,
            text,
        }));

    // The crop follows the photograph's own intrinsic size, so swapping in a
    // portrait asset does not get letterboxed into the default 3:2.
    const photoAspect =
        photoWidth > 0 && photoHeight > 0
            ? `${photoWidth} / ${photoHeight}`
            : `${defaults.photoWidth} / ${defaults.photoHeight}`;

    const palette = {
        "--ayr-panel": panelColor,
        "--ayr-lead": leadColor,
        "--ayr-text": textColor,
        "--ayr-btn-bg": buttonColor,
        "--ayr-btn-bg-hover": buttonHoverColor,
        "--ayr-btn-fg": buttonTextColor,
        "--ayr-btn-fg-hover": buttonHoverTextColor,
        "--ayr-photo-ar": photoAspect,
        fontFamily: defaults.fontBody,
    } as React.CSSProperties;

    const hasButton = Boolean(buttonCaption && buttonAction);

    return (
        <Section
            theme={overiddenTheme}
            id={cssId}
            background={background}
            nextTheme={nextTheme as "dark" | "light"}
        >
            <div
                className="flex w-full flex-col overflow-hidden bg-[var(--ayr-panel)] md:flex-row md:items-stretch"
                style={palette}
            >
                {photoUrl && (
                    <div
                        className={clsx(
                            "relative w-full aspect-[var(--ayr-photo-ar)] md:aspect-auto md:w-1/2 md:min-h-[340px]",
                            photoPosition === "right"
                                ? "md:order-2"
                                : "md:order-1",
                        )}
                    >
                        {/* A plain <img> rather than the shared `Image` helper: that
                            helper hard-codes `aspect-video` and cannot fill an
                            equal-height flex column. Same-origin `/anahata/…`
                            assets need no remote-host allowlisting. */}
                        <img
                            src={photoUrl}
                            alt={photoAlt}
                            width={photoWidth}
                            height={photoHeight}
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 h-full w-full object-cover object-center"
                        />
                    </div>
                )}

                <div
                    className={clsx(
                        "w-full bg-[var(--ayr-panel)] bg-auto bg-right-bottom bg-no-repeat px-5 py-10 md:py-[50px] md:pr-5 md:pl-10 lg:pl-[110px]",
                        // One width class only — `md:w-1/2` and `md:w-full`
                        // are the same utility group, so emitting both would
                        // leave the winner up to stylesheet order.
                        photoUrl ? "md:w-1/2" : "md:w-full",
                        photoPosition === "right" ? "md:order-1" : "md:order-2",
                    )}
                    style={
                        decorUrl
                            ? { backgroundImage: `url("${decorUrl}")` }
                            : undefined
                    }
                >
                    <div className="w-full max-w-[480px]">
                        {lead && (
                            <h4 className="mb-[15px] text-left text-[24px] font-bold leading-[1.35] text-[var(--ayr-lead)] md:text-[20px]">
                                {lead}
                            </h4>
                        )}
                        {items.length > 0 && (
                            <ul className="mb-[30px] list-disc pl-[1.25em] text-left text-[14px] leading-[1.65] text-[var(--ayr-text)]">
                                {items.map((bullet) => (
                                    <li
                                        key={bullet.id}
                                        className="mb-[0.5em] last:mb-0"
                                    >
                                        {bullet.text}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {hasButton && (
                            <a
                                href={buttonAction}
                                target={
                                    buttonOpensInNewTab ? "_blank" : undefined
                                }
                                rel={
                                    buttonOpensInNewTab
                                        ? "noopener noreferrer"
                                        : undefined
                                }
                                onClick={
                                    editing
                                        ? (e) => e.preventDefault()
                                        : undefined
                                }
                                className={clsx(
                                    "inline-block max-w-full min-w-[200px] cursor-pointer rounded-[10px] border-0 px-[23px] py-[8px] text-center text-[14px] font-bold capitalize no-underline",
                                    "bg-[var(--ayr-btn-bg)] text-[var(--ayr-btn-fg)]",
                                    "transition-colors duration-100 ease-in motion-reduce:transition-none",
                                    "hover:bg-[var(--ayr-btn-bg-hover)] hover:text-[var(--ayr-btn-fg-hover)]",
                                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ayr-btn-bg-hover)]",
                                    /* Pinned to the hover ground + text, not just dimmed from
                                       rest: a keyboard Enter/Space press fires :active without
                                       :hover, and cocoa-on-saffron-dimmed only reaches ~2.6:1
                                       with white text — rust-dimmed with white text is 8.5:1. */
                                    "active:bg-[var(--ayr-btn-bg-hover)] active:text-[var(--ayr-btn-fg-hover)] active:translate-y-[1px] active:brightness-90",
                                )}
                            >
                                {buttonCaption}
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </Section>
    );
}
