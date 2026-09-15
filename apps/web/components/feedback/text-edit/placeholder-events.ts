import type { ImageSource } from "@courselit/common-models";

type ImageSlot = {
    key: string;
    element: HTMLElement;
    before: ImageSource;
};

/** Only mounted in page edit mode; every target has a server-enumerated slot. */
export function bindPlaceholderEvents<T extends ImageSlot>(
    slots: T[],
    disabled: boolean,
    open: (slot: T) => void,
    drop: (slot: T, files: File[]) => void,
    drag: (key: string | null) => void,
) {
    const slotAt = (target: EventTarget | null) => {
        if (!(target instanceof Element)) return;
        const control = target.closest<HTMLElement>("[data-kk-image-control]");
        if (control)
            return slots.find(
                (slot) => slot.key === control.dataset.kkImageControl,
            );
        if (target.closest("[data-feedback-ui]")) return;
        const element = target.closest("[data-kk-image-path]");
        return slots.find((slot) => slot.element === element);
    };
    const click = (event: MouseEvent) => {
        if (!(event.target instanceof Element)) return;
        if (event.target.closest("[data-feedback-ui]")) return;
        const slot = slotAt(event.target);
        // A hero can wrap other content. Only the actual well acts as a picker.
        if (
            slot?.before.kind !== "placeholder" ||
            !event.target.closest('[data-asset="waiting"]')
        )
            return;
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) open(slot);
    };
    const dragOver = (event: DragEvent) => {
        const slot = slotAt(event.target);
        if (!slot || !event.dataTransfer?.types.includes("Files")) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
        drag(disabled ? null : slot.key);
    };
    const dropFile = (event: DragEvent) => {
        const slot = slotAt(event.target);
        if (!slot || !event.dataTransfer?.files.length) return;
        event.preventDefault();
        event.stopPropagation();
        drag(null);
        if (!disabled) drop(slot, Array.from(event.dataTransfer.files));
    };
    const leave = (event: DragEvent) => {
        const next = slotAt(event.relatedTarget);
        if (slotAt(event.target)?.key !== next?.key) drag(null);
    };
    const end = () => drag(null);
    window.addEventListener("click", click, true);
    window.addEventListener("dragover", dragOver, true);
    window.addEventListener("drop", dropFile, true);
    window.addEventListener("dragleave", leave, true);
    window.addEventListener("dragend", end, true);
    return () => {
        window.removeEventListener("click", click, true);
        window.removeEventListener("dragover", dragOver, true);
        window.removeEventListener("drop", dropFile, true);
        window.removeEventListener("dragleave", leave, true);
        window.removeEventListener("dragend", end, true);
    };
}
