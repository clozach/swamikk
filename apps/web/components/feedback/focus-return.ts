import { useLayoutEffect, useRef } from "react";

function available(element: HTMLElement | null): element is HTMLElement {
    if (
        !element?.isConnected ||
        element.matches(":disabled, [aria-disabled=true]")
    )
        return false;
    for (
        let node: HTMLElement | null = element;
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

/** Controlled panels have several openers, rather than one DialogTrigger. */
export function usePanelFocusReturn(open: boolean) {
    const opener = useRef<HTMLElement | null>(null);
    const comment = useRef<HTMLButtonElement>(null);
    const help = useRef<HTMLButtonElement>(null);
    const mounted = useRef(false);
    const isOpen = useRef(open);
    const openedUrl = useRef("");
    useLayoutEffect(() => {
        isOpen.current = open;
    }, [open]);
    useLayoutEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    function remember(element: HTMLElement) {
        opener.current = element;
        openedUrl.current = window.location.href;
    }

    function restore(event: Event) {
        // Prevent Radix's trigger-only fallback, including delayed unmounts.
        event.preventDefault();
        if (
            !mounted.current ||
            isOpen.current ||
            window.location.href !== openedUrl.current
        )
            return;
        if (
            Array.from(
                document.querySelectorAll(
                    '[role="dialog"], [role="alertdialog"]',
                ),
            ).some(
                (element) =>
                    element !== event.target &&
                    element.getAttribute("data-state") !== "closed",
            )
        )
            return;
        const active = document.activeElement;
        // A later intentional focus move wins over this closing animation.
        if (
            active instanceof HTMLElement &&
            active !== document.body &&
            active !== document.documentElement &&
            active.isConnected &&
            !(event.target instanceof Node && event.target.contains(active))
        )
            return;
        const target = [opener.current, comment.current, help.current].find(
            available,
        );
        target?.focus({ preventScroll: true });
    }

    return { remember, restore, comment, help };
}
