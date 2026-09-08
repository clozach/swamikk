import React, { useLayoutEffect, useState, type RefObject } from "react";
import { Link } from "@courselit/components-library";
import { useSocialRotation } from "./use-social-rotation";
import { networkLabel } from "./network-label";
import type {
    BannerFit,
    BannerMode,
    BannerPosition,
    HeroImage,
    HeroAnimation,
} from "./settings";

export interface SharedImageProps {
    frameRef: RefObject<HTMLDivElement>;
    source: string;
    alt: string;
    fit: BannerFit;
    position: BannerPosition;
    mode: BannerMode;
    wordmark: HeroImage;
    wordmarkSrc: string;
    wordmarkWidth: number;
    editing: boolean;
    animation?: HeroAnimation;
}

export const staticImageCss = `
.anahata-hero[data-image-motion="static"] .anahata-hero__cover { display: none; }
.anahata-hero[data-image-motion="static"] .anahata-hero__shared-image {
    position: relative; inset: auto; width: 100%; height: auto; aspect-ratio: 4 / 3;
    transform: none !important; clip-path: none !important; will-change: auto;
}
.anahata-hero[data-image-motion="static"] .anahata-hero__wordmark { display: none; }
`;

export const sharedImageCss = `
.anahata-hero { isolation: isolate; }
.anahata-hero__welcome > div:last-child { position: static; overflow: visible; }
.anahata-hero__image-slot { aspect-ratio: 4 / 3; }
.anahata-hero__shared-image {
    position: absolute; left: 0; top: calc(-1 * var(--anahata-cover-h));
    width: 100%; height: var(--anahata-cover-h); z-index: 1; overflow: hidden;
    transform-origin: center; will-change: transform, clip-path;
}
.anahata-hero__wordmark { opacity: calc(1 - var(--image-progress, 0)); }
.anahata-hero__credit {
    left: var(--image-credit-left, 12px); bottom: var(--image-credit-bottom, 8px);
    transform: scale(var(--image-inverse-scale, 1)); transform-origin: bottom left;
}
${staticImageCss}
@media (prefers-reduced-motion: reduce) {
    ${staticImageCss.split('[data-image-motion="static"]').join("")}
}
@media (max-width: 767.98px) {
    ${staticImageCss.split('[data-image-motion="static"]').join("")}
}
`;

/** One visual frame owns both the shown image's accessible name and its credit. */
export default function SharedImage({
    frameRef,
    source,
    alt,
    fit,
    position,
    mode,
    wordmark,
    wordmarkSrc,
    wordmarkWidth,
    editing,
    animation,
}: SharedImageProps) {
    const [reduced, setReduced] = useState(false);
    useLayoutEffect(() => {
        if (!window.matchMedia) return;
        const query = window.matchMedia("(prefers-reduced-motion: reduce)");
        const update = () => setReduced(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);
    const rotation = useSocialRotation(
        !editing && !reduced && mode.kind === "social-rotation",
    );
    const loaded =
        !editing &&
        !reduced &&
        mode.kind === "social-rotation" &&
        rotation.ready &&
        rotation.current;
    const shownAlt = loaded ? rotation.current!.alt : alt;
    return (
        <div ref={frameRef} className="anahata-hero__shared-image">
            <div
                role={shownAlt ? "img" : undefined}
                aria-label={shownAlt || undefined}
                className={`absolute inset-0 ${animation === "fade" ? "animate-in fade-in [animation-duration:600ms] motion-reduce:animate-none" : ""}`}
                style={{
                    backgroundImage: `url("${source}")`,
                    backgroundSize: fit,
                    backgroundPosition: position,
                    backgroundRepeat: "no-repeat",
                }}
            >
                {loaded &&
                    [true, false].map((layerA) => (
                        <div
                            key={String(layerA)}
                            aria-hidden="true"
                            className="absolute inset-0 bg-no-repeat transition-opacity duration-700 motion-reduce:transition-none"
                            style={{
                                backgroundImage: `url("${layerA ? rotation.layerA : rotation.layerB}")`,
                                backgroundSize: fit,
                                backgroundPosition: position,
                                opacity: layerA === rotation.showA ? 1 : 0,
                            }}
                        />
                    ))}
            </div>
            {wordmarkSrc && (
                <div className="anahata-hero__wordmark absolute inset-0 flex items-center justify-center px-[5%] py-[5%] pointer-events-none">
                    <img
                        src={wordmarkSrc}
                        alt={wordmark.alt}
                        className="w-full h-auto max-h-full object-contain"
                        style={{ maxWidth: wordmarkWidth }}
                    />
                </div>
            )}
            {loaded && (
                <Link
                    href={rotation.current!.postUrl}
                    className="anahata-hero__credit absolute z-10 rounded-sm bg-black/60 px-2 py-1 text-xs text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                    {`Photo from ${networkLabel(rotation.current!.networkDomain)}`}
                </Link>
            )}
        </div>
    );
}
