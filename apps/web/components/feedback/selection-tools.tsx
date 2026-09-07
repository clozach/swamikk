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
    const [help, setHelp] = useState<TargetBounds | null>(null);
    const viewport = useVisualViewport();
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const control = host?.querySelector<HTMLElement>(
            ".kk-feedback-corner > button",
        );
        const update = () => {
            setSize({
                width: element.offsetWidth,
                height: element.offsetHeight,
            });
            const rect = control?.getBoundingClientRect();
            setHelp(
                rect && rect.width && rect.height
                    ? {
                          left: rect.left,
                          top: rect.top,
                          right: rect.right,
                          bottom: rect.bottom,
                      }
                    : null,
            );
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        if (control) observer.observe(control);
        // The mobile purchase bar raises the control through a root CSS variable.
        const rootStyle = new MutationObserver(update);
        rootStyle.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["style"],
        });
        return () => {
            observer.disconnect();
            rootStyle.disconnect();
        };
    }, [host, viewport]);
    if (!host) return null;
    return createPortal(
        <div
            ref={ref}
            data-feedback-ui
            className="kk-feedback-magnet border bg-background text-foreground shadow-xl"
            role="toolbar"
            aria-label={label}
            style={
                viewport ? placeMagnet(target, viewport, size, help) : undefined
            }
        >
            {children}
        </div>,
        host,
    );
}
