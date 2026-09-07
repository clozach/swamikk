import { useEffect, useState } from "react";
import { PageSelection, selectionFromElement } from "./targets";

export type SelectionMode =
    | { kind: "closed" }
    | { kind: "choosing" }
    | { kind: "selected"; selection: PageSelection };

export function useSelection(path: string, suspended: boolean) {
    const [mode, setMode] = useState<SelectionMode>({ kind: "closed" });
    const [hover, setHover] = useState<PageSelection | null>(null);
    const [modifier, setModifier] = useState(false);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const selected = mode.kind === "selected" ? mode.selection : null;
    const highlighted =
        (modifier || mode.kind === "choosing") && hover ? hover : selected;

    const [lastPath, setLastPath] = useState(path);
    if (lastPath !== path) {
        setLastPath(path);
        setMode({ kind: "closed" });
        setHover(null);
        setModifier(false);
    }
    useEffect(() => {
        const update = () =>
            setRect(
                highlighted?.element?.isConnected
                    ? highlighted.element.getBoundingClientRect()
                    : null,
            );
        update();
        const observer = new ResizeObserver(update);
        if (highlighted?.element) observer.observe(highlighted.element);
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        return () => {
            observer.disconnect();
            window.removeEventListener("scroll", update, true);
            window.removeEventListener("resize", update);
        };
    }, [highlighted]);

    useEffect(() => {
        const close = () => {
            setMode({ kind: "closed" });
            setHover(null);
        };
        const keys = (event: KeyboardEvent) => {
            setModifier(event.ctrlKey || event.metaKey);
            const typing =
                event.target instanceof HTMLElement &&
                event.target.closest(
                    "input,textarea,select,[contenteditable=true]",
                );
            if (suspended || typing || event.type !== "keydown" || event.repeat)
                return;
            if (event.key === "Escape") close();
            if (
                event.key === "?" &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey
            ) {
                event.preventDefault();
                setMode((current) =>
                    current.kind === "closed"
                        ? { kind: "choosing" }
                        : { kind: "closed" },
                );
            }
            if (
                event.shiftKey &&
                (event.key === "Meta" || event.key === "Control")
            )
                close();
        };
        const move = (event: PointerEvent) => {
            if (
                !suspended &&
                (event.metaKey || event.ctrlKey || mode.kind === "choosing")
            ) {
                const next = selectionFromElement(event.target, path);
                setHover((previous) =>
                    previous?.element === next?.element ? previous : next,
                );
            }
        };
        const click = (event: MouseEvent) => {
            if (
                suspended ||
                (event.target instanceof HTMLElement &&
                    event.target.closest("[data-feedback-ui]"))
            )
                return;
            if (event.metaKey || event.ctrlKey || mode.kind === "choosing") {
                const choice = selectionFromElement(event.target, path);
                if (!choice) return;
                event.preventDefault();
                event.stopPropagation();
                if (
                    mode.kind === "selected" &&
                    event.shiftKey &&
                    mode.selection.element?.contains(event.target as Node)
                )
                    close();
                else {
                    setMode({ kind: "selected", selection: choice });
                    setHover(null);
                }
            } else if (
                mode.kind === "selected" &&
                !mode.selection.element?.contains(event.target as Node)
            )
                close();
        };
        const blur = () => {
            setModifier(false);
            setHover(null);
        };
        window.addEventListener("keydown", keys);
        window.addEventListener("keyup", keys);
        window.addEventListener("pointermove", move);
        window.addEventListener("click", click, true);
        window.addEventListener("blur", blur);
        return () => {
            window.removeEventListener("keydown", keys);
            window.removeEventListener("keyup", keys);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("click", click, true);
            window.removeEventListener("blur", blur);
        };
    }, [mode, path, suspended]);
    return { mode, setMode, selected, rect, modifier };
}
