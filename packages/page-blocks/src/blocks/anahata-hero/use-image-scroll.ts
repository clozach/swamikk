import { useLayoutEffect, type RefObject } from "react";
import {
    imageJourney,
    imagePose,
    type ImageJourney,
} from "./image-scroll-geometry";

export interface ImageScrollRefs {
    root: RefObject<HTMLDivElement>;
    cover: RefObject<HTMLDivElement>;
    destination: RefObject<HTMLDivElement>;
    image: RefObject<HTMLDivElement>;
}

/** One passive listener, one scheduled paint, and no geometry reads during scroll. */
export function useImageScroll(refs: ImageScrollRefs, enabled: boolean): void {
    const { root, cover, destination, image } = refs;
    useLayoutEffect(() => {
        const host = root.current;
        const start = cover.current;
        const end = destination.current;
        const frame = image.current;
        if (!host || !start || !end || !frame) return;
        // iPadOS requests desktop pages with a Mac platform and user agent.
        const isIOS =
            /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        if (!enabled || isIOS || !window.matchMedia || !window.ResizeObserver) {
            host.dataset.imageMotion = "static";
            frame.removeAttribute("style");
            return;
        }
        const preference = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        );
        let geometry: ImageJourney | null = null;
        let scheduled = 0;
        let disposed = false;
        let needsMeasure = true;
        let lastProgress = -1;
        const makeStatic = () => {
            host.dataset.imageMotion = "static";
            frame.removeAttribute("style");
            geometry = null;
            lastProgress = -1;
        };
        const paint = () => {
            scheduled = 0;
            if (disposed) return;
            if (needsMeasure) {
                needsMeasure = false;
                lastProgress = -1;
                const row = end.parentElement;
                // Match the welcome row's md breakpoint and actual layout.
                if (
                    preference.matches ||
                    window.innerWidth < 768 ||
                    !row ||
                    !["row", "row-reverse"].includes(
                        window.getComputedStyle(row).flexDirection,
                    )
                ) {
                    makeStatic();
                    return;
                }
                // The static fallback hides the cover. Restore it only once
                // this layout is eligible, before reading its endpoints.
                host.dataset.imageMotion = "scroll";
                const a = start.getBoundingClientRect();
                const b = end.getBoundingClientRect();
                const scrollY = window.scrollY;
                geometry = imageJourney(
                    {
                        left: a.left,
                        top: a.top + scrollY,
                        width: a.width,
                        height: a.height,
                    },
                    {
                        left: b.left,
                        top: b.top + scrollY,
                        width: b.width,
                        height: b.height,
                    },
                    window.innerHeight,
                );
                if (!geometry) {
                    makeStatic();
                    return;
                }
                frame.style.width = `${a.width}px`;
                frame.style.height = `${a.height}px`;
                frame.style.top = `${-a.height}px`;
            }
            if (!geometry) return;
            const pose = imagePose(geometry, window.scrollY);
            if (pose.progress === lastProgress) return;
            lastProgress = pose.progress;
            frame.style.transform = `translate3d(${pose.x}px, ${pose.y}px, 0) scale(${pose.scale})`;
            frame.style.clipPath = `inset(${pose.insetY}px ${pose.insetX}px)`;
            frame.style.setProperty("--image-progress", `${pose.progress}`);
            frame.style.setProperty(
                "--image-inverse-scale",
                `${1 / pose.scale}`,
            );
            frame.style.setProperty(
                "--image-credit-left",
                `${pose.insetX + 12 / pose.scale}px`,
            );
            frame.style.setProperty(
                "--image-credit-bottom",
                `${pose.insetY + 8 / pose.scale}px`,
            );
        };
        const schedule = () => {
            if (!scheduled && (needsMeasure || geometry))
                scheduled = requestAnimationFrame(paint);
        };
        const measure = () => {
            needsMeasure = true;
            schedule();
        };
        const configure = () => {
            cancelAnimationFrame(scheduled);
            scheduled = 0;
            needsMeasure = true;
            paint();
        };
        const observer = new ResizeObserver(measure);
        observer.observe(start);
        observer.observe(end);
        if (end.parentElement) observer.observe(end.parentElement);
        // Content above the widget may settle after fonts/images load.
        observer.observe(document.body);
        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", measure);
        preference.addEventListener("change", configure);
        document.fonts?.ready.then(() => {
            if (!disposed) measure();
        });
        configure();
        return () => {
            disposed = true;
            cancelAnimationFrame(scheduled);
            observer.disconnect();
            window.removeEventListener("scroll", schedule);
            window.removeEventListener("resize", measure);
            preference.removeEventListener("change", configure);
            makeStatic();
        };
    }, [root, cover, destination, image, enabled]);
}
