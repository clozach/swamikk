"use client";

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { WidgetProps } from "@courselit/common-models";
import { ThemeStyle } from "@courselit/page-models";
import { Section } from "@courselit/page-primitives";
import Settings from "./settings";
import {
    ASPECT_RATIO_OPTIONS,
    CARD,
    CREAM,
    FONT_BODY,
    FONT_DISPLAY,
    HOVER_DURATION_MS,
    IFRAME_ALLOW,
    INK,
    MOBILE_BREAKPOINT_PX,
    RUST,
    RUST_PRESSED,
    SAFFRON,
    aspectRatioToPaddingTop,
    caption as defaultCaption,
    captionPlacement as defaultCaptionPlacement,
    desktopAspectRatio as defaultDesktopAspectRatio,
    heading as defaultHeading,
    headingAlignment as defaultHeadingAlignment,
    loadStrategy as defaultLoadStrategy,
    mobileAspectRatio as defaultMobileAspectRatio,
    posterButtonLabel as defaultPosterButtonLabel,
    posterHelpText as defaultPosterHelpText,
    showDivider as defaultShowDivider,
    tourTitle as defaultTourTitle,
    tourUrl as defaultTourUrl,
} from "./defaults";

/**
 * What the frame is currently showing. A discriminated union rather than a
 * `hasLoaded` boolean so "poster" and "live" can never both be true, and so
 * the poster-only markup has exactly one place it can be reached from.
 */
type FrameState = { kind: "poster" } | { kind: "live" };

const VALID_RATIOS = ASPECT_RATIO_OPTIONS.map((option) => option.value);

/** CSS-safe scope token derived from the widget instance id (stable across SSR). */
function toScope(id: string | undefined): string {
    const cleaned = (id || "").replace(/[^A-Za-z0-9_-]/g, "");
    return cleaned.length ? cleaned : "default";
}

function normalizeRatio(value: string | undefined, fallback: string): string {
    return value && (VALID_RATIOS as string[]).includes(value)
        ? value
        : fallback;
}

export default function Widget({
    id,
    settings: {
        heading = defaultHeading,
        headingAlignment = defaultHeadingAlignment,
        showDivider = defaultShowDivider,
        caption = defaultCaption,
        captionPlacement = defaultCaptionPlacement,
        tourUrl = defaultTourUrl,
        tourTitle = defaultTourTitle,
        desktopAspectRatio = defaultDesktopAspectRatio,
        mobileAspectRatio = defaultMobileAspectRatio,
        loadStrategy = defaultLoadStrategy,
        posterImage,
        posterButtonLabel = defaultPosterButtonLabel,
        posterHelpText = defaultPosterHelpText,
        cssId,
        maxWidth,
        verticalPadding,
        background,
    },
    state: { theme },
    editing,
    nextTheme,
}: WidgetProps<Settings>) {
    const overiddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
    overiddenTheme.structure.page.width =
        maxWidth || theme.theme.structure.page.width;
    overiddenTheme.structure.section.padding.y =
        verticalPadding || theme.theme.structure.section.padding.y;

    const scope = useMemo(() => toScope(id), [id]);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const shouldFocusFrame = useRef(false);

    const [frameState, setFrameState] = useState<FrameState>(() =>
        loadStrategy === "click" ? { kind: "poster" } : { kind: "live" },
    );

    // Keep the frame honest when the setting is flipped inside the page editor.
    useEffect(() => {
        setFrameState(
            loadStrategy === "click" ? { kind: "poster" } : { kind: "live" },
        );
        shouldFocusFrame.current = false;
    }, [loadStrategy, tourUrl]);

    // Hand keyboard focus to the tour once the visitor has asked for it, so
    // tabbing does not fall through to whatever followed the poster button.
    useEffect(() => {
        if (frameState.kind === "live" && shouldFocusFrame.current) {
            shouldFocusFrame.current = false;
            iframeRef.current?.focus();
        }
    }, [frameState]);

    const activate = useCallback(() => {
        shouldFocusFrame.current = true;
        setFrameState({ kind: "live" });
    }, []);

    const desktopPaddingTop = aspectRatioToPaddingTop(
        normalizeRatio(desktopAspectRatio, defaultDesktopAspectRatio),
    );
    const mobilePaddingTop = aspectRatioToPaddingTop(
        normalizeRatio(mobileAspectRatio, defaultMobileAspectRatio),
    );

    const alignment = headingAlignment === "left" ? "left" : "center";
    const posterFile = posterImage?.file || posterImage?.thumbnail;
    /* A media URL can legally contain parentheses, quotes, or spaces, any of
       which would terminate an unquoted url() early. Quote it and escape the
       two characters that could still break out. */
    const posterUrl = posterFile
        ? `url("${posterFile.replace(/["\\]/g, "\\$&")}")`
        : undefined;
    /* An iframe with an empty title is unlabelled to a screen reader, so an
       emptied Tour title falls back to the shipped one rather than to "". */
    const frameTitle = tourTitle?.trim() ? tourTitle : defaultTourTitle;

    /*
     * Scoped stylesheet. The Anahata palette lives outside the CourseLit theme
     * tokens, and this package's Tailwind build cannot express the source
     * site's exact type stack, hover chain, or the 767px reflow — so the
     * block ships its own CSS, namespaced by the widget instance id.
     */
    const styles = `
[data-anahata-tour="${scope}"] {
    font-family: ${FONT_BODY};
    color: ${INK};
    line-height: 1.65;
}
[data-anahata-tour="${scope}"] .anahata-tour__rule {
    width: 80%;
    max-width: 200px;
    height: 0;
    border: 0;
    border-bottom: 2px solid ${RUST};
    margin: 0 auto 55px;
}
[data-anahata-tour="${scope}"][data-align="left"] .anahata-tour__rule {
    margin-left: 0;
}
[data-anahata-tour="${scope}"] .anahata-tour__heading {
    font-family: ${FONT_DISPLAY};
    font-size: 32px;
    font-weight: 400;
    line-height: 1.2;
    color: ${RUST};
    text-align: ${alignment};
    margin: 0;
    padding: 0 0 15px;
    text-transform: none;
}
[data-anahata-tour="${scope}"] .anahata-tour__spacer {
    height: 32px;
}
[data-anahata-tour="${scope}"] .anahata-tour__caption {
    font-size: 14px;
    line-height: 1.65;
    color: ${INK};
    text-align: ${alignment};
    margin: 0;
}
[data-anahata-tour="${scope}"] .anahata-tour__caption--below {
    margin-top: 32px;
}
[data-anahata-tour="${scope}"] .anahata-tour__caption--above {
    margin-bottom: 32px;
}
/* The frame reserves its own height, so the absolutely positioned iframe and
   poster are clamped to it on both axes and can never overflow the page. */
[data-anahata-tour="${scope}"] .anahata-tour__frame {
    position: relative;
    width: 100%;
    max-width: 100%;
    height: 0;
    padding-top: ${desktopPaddingTop.toFixed(4)}%;
    overflow: hidden;
    background-color: ${CREAM};
}
[data-anahata-tour="${scope}"] .anahata-tour__iframe,
[data-anahata-tour="${scope}"] .anahata-tour__poster {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: 0;
}
[data-anahata-tour="${scope}"] .anahata-tour__poster {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 24px;
    box-sizing: border-box;
    text-align: center;
    /* A short frame (21:9 on a phone) would otherwise clip the button out of
       reach; scrolling inside the poster keeps it usable and cannot widen the
       page, since the poster is inset:0 within a fixed-ratio box. */
    overflow: auto;
    background-color: ${CREAM};
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
}
[data-anahata-tour="${scope}"] .anahata-tour__poster-help {
    max-width: 42ch;
    margin: 0;
    font-size: 14px;
    line-height: 1.65;
    color: ${INK};
    background-color: ${posterFile ? "rgba(255,255,255,0.88)" : "transparent"};
    border-radius: 4px;
    padding: ${posterFile ? "6px 12px" : "0"};
}
[data-anahata-tour="${scope}"] .anahata-tour__button {
    display: inline-block;
    background-color: ${SAFFRON};
    color: ${CARD};
    font-family: ${FONT_BODY};
    font-size: 14px;
    font-weight: 700;
    line-height: inherit;
    text-align: center;
    text-transform: capitalize;
    text-decoration: none;
    width: auto;
    min-width: 200px;
    max-width: 100%;
    padding: 8px 23px;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: background-color ${HOVER_DURATION_MS}ms ease-in,
        color ${HOVER_DURATION_MS}ms ease-in,
        transform ${HOVER_DURATION_MS}ms ease-in;
}
[data-anahata-tour="${scope}"] .anahata-tour__button:hover {
    background-color: ${RUST};
    color: ${CARD};
}
[data-anahata-tour="${scope}"] .anahata-tour__button:focus-visible {
    outline: 2px solid ${RUST};
    outline-offset: 2px;
}
[data-anahata-tour="${scope}"] .anahata-tour__button:active {
    background-color: ${RUST_PRESSED};
    transform: translateY(1px);
}
[data-anahata-tour="${scope}"] .anahata-tour__iframe:focus-visible {
    outline: 2px solid ${RUST};
    outline-offset: -2px;
}
@media (max-width: ${MOBILE_BREAKPOINT_PX}px) {
    [data-anahata-tour="${scope}"] .anahata-tour__frame {
        padding-top: ${mobilePaddingTop.toFixed(4)}%;
    }
    [data-anahata-tour="${scope}"] .anahata-tour__button {
        min-width: 0;
        width: 100%;
        max-width: 280px;
    }
}
@media (prefers-reduced-motion: reduce) {
    [data-anahata-tour="${scope}"] .anahata-tour__button {
        transition: none;
    }
    [data-anahata-tour="${scope}"] .anahata-tour__button:active {
        transform: none;
    }
}
`;

    const captionNode = caption ? (
        <p
            className={`anahata-tour__caption anahata-tour__caption--${captionPlacement === "above" ? "above" : "below"}`}
        >
            {caption}
        </p>
    ) : null;

    return (
        <Section
            theme={overiddenTheme}
            id={cssId}
            background={background}
            nextTheme={nextTheme as "dark" | "light"}
        >
            <style>{styles}</style>
            <div
                data-anahata-tour={scope}
                data-align={alignment}
                className="anahata-tour flex flex-col w-full"
            >
                {showDivider && (
                    <hr className="anahata-tour__rule" aria-hidden="true" />
                )}
                {heading && (
                    <>
                        <h2 className="anahata-tour__heading">{heading}</h2>
                        {/* The source's 32px vc_empty_space sits between the
                            heading and the frame, so it goes when the heading
                            does rather than leaving a stray gap. */}
                        <div
                            className="anahata-tour__spacer"
                            aria-hidden="true"
                        />
                    </>
                )}

                {captionPlacement === "above" && captionNode}

                <div className="anahata-tour__frame">
                    {frameState.kind === "live" ? (
                        <iframe
                            ref={iframeRef}
                            className="anahata-tour__iframe"
                            src={tourUrl}
                            name={frameTitle}
                            title={frameTitle}
                            width="100%"
                            height="100%"
                            frameBorder={0}
                            loading="lazy"
                            allow={IFRAME_ALLOW}
                            allowFullScreen
                            /* In the page editor the click-to-edit scrim must win,
                               so the tour is inert there and live everywhere else. */
                            style={
                                editing ? { pointerEvents: "none" } : undefined
                            }
                        />
                    ) : (
                        <div
                            className="anahata-tour__poster"
                            style={
                                posterUrl
                                    ? { backgroundImage: posterUrl }
                                    : undefined
                            }
                        >
                            {posterHelpText && (
                                <p className="anahata-tour__poster-help">
                                    {posterHelpText}
                                </p>
                            )}
                            <button
                                type="button"
                                className="anahata-tour__button"
                                onClick={activate}
                            >
                                {posterButtonLabel}
                            </button>
                        </div>
                    )}
                </div>

                {captionPlacement !== "above" && captionNode}
            </div>
        </Section>
    );
}
