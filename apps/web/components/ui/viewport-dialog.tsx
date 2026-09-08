import { useState, type ReactNode } from "react";
import { DialogContent } from "@/components/ui/dialog";
import { useVisualViewport } from "@/components/feedback/viewport";
import "./viewport-dialog.css";

export type DialogFocusOrigin = {
    element: Element | null;
    fallback?: HTMLElement | null;
    url: string;
};

function available(target: Element | null | undefined): target is HTMLElement {
    if (
        !(target instanceof HTMLElement) ||
        !target.isConnected ||
        target === document.body ||
        target.matches(":disabled, [aria-disabled=true]")
    )
        return false;
    for (
        let node: HTMLElement | null = target;
        node;
        node = node.parentElement
    ) {
        const style = getComputedStyle(node);
        if (
            node.hidden ||
            node.hasAttribute("inert") ||
            style.display === "none" ||
            style.visibility === "hidden"
        )
            return false;
    }
    return true;
}

/** Opt-in panels share viewport bounds, while their own controls stay fixed. */
export function ViewportDialog({
    kind,
    children,
    focusOrigin,
}: {
    kind: "review" | "comment";
    children: ReactNode;
    focusOrigin?: DialogFocusOrigin | null;
}) {
    const viewport = useVisualViewport();
    const fullViewport = !!viewport && viewport.width < 640;
    // The frame mounts when its controlled panel opens, before child autofocus.
    const [origin] = useState<DialogFocusOrigin>(
        () =>
            focusOrigin ?? {
                element:
                    typeof document === "undefined"
                        ? null
                        : document.activeElement,
                url: typeof window === "undefined" ? "" : window.location.href,
            },
    );
    function restoreFocus(event: Event) {
        event.preventDefault();
        if (window.location.href !== origin.url) return;
        if (
            Array.from(
                document.querySelectorAll(
                    '[role="dialog"], [role="alertdialog"]',
                ),
            ).some(
                (panel) =>
                    panel !== event.target &&
                    panel.getAttribute("data-state") !== "closed",
            )
        )
            return;
        const active = document.activeElement;
        if (
            active instanceof HTMLElement &&
            active.isConnected &&
            active !== document.body &&
            active !== document.documentElement &&
            !(event.target instanceof Node && event.target.contains(active))
        )
            return;
        const target = [origin.element, origin.fallback].find(available);
        target?.focus({ preventScroll: true });
    }
    return (
        <DialogContent
            onCloseAutoFocus={restoreFocus}
            data-feedback-ui={kind === "comment" || undefined}
            data-full-viewport={fullViewport || undefined}
            className="kk-viewport-dialog flex flex-col gap-0 overflow-hidden p-0"
            style={
                viewport
                    ? {
                          left:
                              viewport.left +
                              (fullViewport ? 0 : viewport.width / 2),
                          top:
                              viewport.top +
                              (fullViewport ? 0 : viewport.height / 2),
                          width: fullViewport
                              ? viewport.width
                              : Math.min(576, viewport.width - 32),
                          maxWidth: viewport.width,
                          height: fullViewport
                              ? viewport.height
                              : kind === "comment"
                                ? Math.min(700, viewport.height - 32)
                                : undefined,
                          maxHeight: fullViewport
                              ? viewport.height
                              : viewport.height - 32,
                          transform: fullViewport ? "none" : undefined,
                      }
                    : undefined
            }
        >
            {children}
        </DialogContent>
    );
}
