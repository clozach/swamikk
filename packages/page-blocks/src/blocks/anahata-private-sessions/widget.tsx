import React from "react";
import clsx from "clsx";
import { WidgetProps } from "@courselit/common-models";
import { Section } from "@courselit/page-primitives";
import { ThemeStyle } from "@courselit/page-models";
// Direct paths, not the `../../components` barrel: the barrel also exports the
// tiptap-backed text renderer, which the widget does not need and jest cannot load.
import {
    hasWell,
    isWaiting,
    normalizeImageSource,
    resolveImageSrc,
} from "../../components/image-source";
import { WaitingForAsset } from "../../components/waiting-for-asset";
import Settings, { Bullet } from "./settings";
import * as defaults from "./defaults";
import {
    externalLinkProps,
    ExternalLinkLabel,
} from "@courselit/components-library";

/**
 * "Work with Swami one to one" — the Forest & Bone split.
 *
 * Source of truth: `design-explorations/homepage-redesign/02-forest-and-bone.html`
 * § 3 and `homepage-redesign-spec.md` § 3. A 3:2 photograph (or its
 * waiting-for-asset well) on one side; on the other a Playfair H2, the lead,
 * the seven bullets with pine dot markers, and the pine button. On phones the
 * copy leads and the picture follows it.
 *
 * Colours arrive as settings, so they are threaded through CSS custom properties
 * rather than Tailwind literals — that keeps `hover:`/`focus-visible:`/`active:`
 * working (an inline `style` cannot express them) while still letting Karuna
 * repaint the block from the page builder.
 */
export default function Widget({
    settings: {
        photo: photoSetting,
        photoAlt = defaults.photoAlt,
        photoWidth = defaults.photoWidth,
        photoHeight = defaults.photoHeight,
        decorImage: decorSetting,
        showDecorImage = defaults.showDecorImage,
        heading = defaults.heading,
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

    // Boundary parse: documents saved before the shared union (or hand-edited)
    // still arrive as the old two-arm shape, which `normalizeImageSource`
    // passes through; anything unreadable falls back to the default.
    const photo = normalizeImageSource(photoSetting) ?? defaults.photo;
    const photoUrl = resolveImageSrc(photo);
    const showPhoto = hasWell(photo);

    const decorImage =
        normalizeImageSource(decorSetting) ?? defaults.decorImage;
    const decorUrl = showDecorImage ? resolveImageSrc(decorImage) : undefined;
    const decorWaiting = showDecorImage && isWaiting(decorImage);

    // `undefined` means "never edited" -> seed the defaults. An empty array is
    // a deliberate edit (Karuna deleted every bullet) and must be honoured,
    // otherwise the deletion silently reverts on the rendered page.
    const items: Bullet[] =
        bullets ??
        defaults.bulletTexts.map((text, index) => ({
            id: `default-${index}`,
            text,
        }));

    // The box follows the photograph's own intrinsic size (3:2 by default), so
    // the well is judged with the real geometry and a portrait asset is not
    // letterboxed once it lands.
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
        "--ayr-focus": defaults.focusColor,
        "--ayr-photo-ar": photoAspect,
        fontFamily: defaults.fontBody,
    } as React.CSSProperties;

    const hasButton = Boolean(buttonCaption && buttonAction);
    const buttonDestination = externalLinkProps(buttonAction, {
        openInSameTab: buttonOpensInNewTab ? false : undefined,
    });

    return (
        <Section
            theme={overiddenTheme}
            id={cssId}
            background={background}
            nextTheme={nextTheme as "dark" | "light"}
        >
            <div
                className="grid w-full grid-cols-1 items-center gap-7 bg-[var(--ayr-panel)] md:grid-cols-2 md:gap-10 lg:gap-16"
                style={palette}
            >
                {showPhoto && (
                    <div
                        className={clsx(
                            // The one box both the photograph and its well
                            // occupy: full column width, intrinsic aspect.
                            "relative order-2 w-full aspect-[var(--ayr-photo-ar)]",
                            photoPosition === "right"
                                ? "md:order-2"
                                : "md:order-1",
                        )}
                    >
                        {isWaiting(photo) ? (
                            <WaitingForAsset
                                fill
                                description={photo.description}
                            />
                        ) : (
                            /* A plain <img> rather than the shared `Image` helper: that
                               helper hard-codes `aspect-video`. Same-origin `/anahata/…`
                               assets need no remote-host allowlisting. */
                            <img
                                src={photoUrl}
                                alt={photoAlt}
                                width={photoWidth}
                                height={photoHeight}
                                loading="lazy"
                                decoding="async"
                                className="absolute inset-0 h-full w-full object-cover object-center"
                            />
                        )}
                    </div>
                )}

                <div
                    className={clsx(
                        "relative order-1 w-full bg-auto bg-right-bottom bg-no-repeat",
                        showPhoto ? "" : "md:col-span-2",
                        photoPosition === "right" ? "md:order-1" : "md:order-2",
                    )}
                    style={
                        decorUrl
                            ? { backgroundImage: `url("${decorUrl}")` }
                            : undefined
                    }
                >
                    {decorWaiting && isWaiting(decorImage) && (
                        /* The ornament's own well, in the natural-size box the
                           CSS background would paint. */
                        <WaitingForAsset
                            description={decorImage.description}
                            className="pointer-events-none absolute bottom-0 right-0 max-w-full"
                            width={378}
                            aspectRatio="378 / 395"
                        />
                    )}
                    <div className="relative w-full">
                        {heading && (
                            <h2
                                className="m-0 text-left text-[length:clamp(28px,3vw,36px)] font-normal leading-[1.15] tracking-[-0.01em] text-[color:var(--ayr-lead)]"
                                style={{ fontFamily: defaults.fontDisplay }}
                            >
                                {heading}
                            </h2>
                        )}
                        {lead && (
                            <p className="mb-0 mt-4 max-w-[60ch] text-left text-[18px] leading-[1.6] text-[color:var(--ayr-lead)]">
                                {lead}
                            </p>
                        )}
                        {items.length > 0 && (
                            <ul className="mb-8 mt-6 grid max-w-[60ch] list-none gap-[10px] p-0 text-left text-[16px] leading-[1.65] text-[color:var(--ayr-text)]">
                                {items.map((bullet) => (
                                    <li
                                        key={bullet.id}
                                        className="relative m-0 pl-[22px] before:absolute before:left-[2px] before:top-[0.62em] before:h-2 before:w-2 before:rounded-full before:bg-[color:var(--ayr-lead)] before:content-['']"
                                    >
                                        {bullet.text}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {hasButton && (
                            <a
                                href={buttonAction}
                                {...buttonDestination}
                                onClick={
                                    editing
                                        ? (e) => e.preventDefault()
                                        : undefined
                                }
                                className={clsx(
                                    "inline-flex min-h-[48px] max-w-full cursor-pointer items-center justify-center gap-2 rounded-[6px] border-[1.5px] border-solid px-[22px] py-[11px] text-center text-[16px] font-bold leading-[1.2] no-underline",
                                    "border-[color:var(--ayr-btn-bg)] bg-[color:var(--ayr-btn-bg)] text-[color:var(--ayr-btn-fg)]",
                                    "transition-colors duration-100 ease-in motion-reduce:transition-none",
                                    "hover:border-[color:var(--ayr-btn-bg-hover)] hover:bg-[color:var(--ayr-btn-bg-hover)] hover:text-[color:var(--ayr-btn-fg-hover)] hover:no-underline",
                                    /* :active mirrors :hover explicitly — a keyboard
                                       Enter/Space press fires :active without :hover,
                                       and must land on the same ground + text. */
                                    "active:border-[color:var(--ayr-btn-bg-hover)] active:bg-[color:var(--ayr-btn-bg-hover)] active:text-[color:var(--ayr-btn-fg-hover)] active:no-underline",
                                    "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[color:var(--ayr-focus)]",
                                )}
                            >
                                <ExternalLinkLabel
                                    newTab={
                                        buttonDestination.target === "_blank"
                                    }
                                >
                                    {buttonCaption}
                                </ExternalLinkLabel>
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </Section>
    );
}
