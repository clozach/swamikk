import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeMagnet, TargetBounds } from "./magnet-placement";
import { usePortalHost, useVisualViewport } from "./viewport";

export function SelectionTools({
    children,
    target,
    label,
}: {
    children: ReactNode;
    target: TargetBounds | null;
    label: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const host = usePortalHost();
    const [size, setSize] = useState({ width: 280, height: 60 });
    const viewport = useVisualViewport();
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const update = () =>
            setSize({
                width: element.offsetWidth,
                height: element.offsetHeight,
            });
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, [host]);
    if (!host) return null;
    return createPortal(
        <div
            ref={ref}
            data-feedback-ui
            className="kk-feedback-magnet border bg-background text-foreground shadow-xl"
            role="toolbar"
            aria-label={label}
            style={viewport ? placeMagnet(target, viewport, size) : undefined}
        >
            {children}
        </div>,
        host,
    );
}
