"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type {
    ImageSource,
    Media,
    TextEditTarget,
} from "@courselit/common-models";
import {
    ImageFileInput,
    maybeDownsizeImage,
    useMediaLit,
} from "@courselit/components-library/images";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shortcut } from "../shortcut";
import { currentAt, type LeafIndex } from "./leaves";

type Slot = {
    key: string;
    element: HTMLElement;
    rect: DOMRect;
    label: string;
    path: string;
    before: ImageSource;
    target: TextEditTarget;
};

/** Explicit block markers map to server-enumerated image fields. No DOM selector is sent as a write target. */
export function ImageEditControls({
    pageId,
    index,
    disabled,
    onSave,
    onBusy,
}: {
    pageId: string;
    index: LeafIndex;
    disabled: boolean;
    onSave: (
        target: TextEditTarget,
        path: string,
        before: ImageSource,
        after: ImageSource,
    ) => Promise<unknown>;
    onBusy: (busy: boolean) => void;
}) {
    const [slots, setSlots] = useState<Slot[]>([]);
    const [selected, setSelected] = useState<Slot | null>(null);
    const [pending, setPending] = useState(false);
    const [hovered, setHovered] = useState<string | null>(null);
    const { uploadFile, uploadProgress, isUploading, cancelUpload } =
        useMediaLit({
            signatureEndpoint: "/api/media/presigned",
            access: "public",
        });
    useEffect(() => {
        let frame = 0;
        const scan = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const found: Slot[] = [];
                document
                    .querySelectorAll<HTMLElement>("[data-kk-image-path]")
                    .forEach((element) => {
                        const widgetId =
                            element.closest<HTMLElement>("[data-feedback-id]")
                                ?.dataset.feedbackId;
                        const widget = widgetId
                            ? index.get(widgetId)
                            : undefined;
                        const path = element.dataset.kkImagePath || "";
                        const image = widget?.images.get(path);
                        if (!image || !widget) return;
                        const rect = element.getBoundingClientRect();
                        if (
                            !rect.width ||
                            !rect.height ||
                            getComputedStyle(element).visibility === "hidden"
                        )
                            return;
                        found.push({
                            key: `${widget.widgetId}:${path}`,
                            element,
                            rect,
                            label: image.label,
                            path,
                            before: image.value,
                            target: widget.shared
                                ? {
                                      kind: "shared-widget-text",
                                      pageId,
                                      name: widget.name,
                                  }
                                : {
                                      kind: "page-widget-text",
                                      pageId,
                                      widgetId: widget.widgetId,
                                  },
                        });
                    });
                setSlots(found);
            });
        };
        const hover = (event: PointerEvent) => {
            if (
                !(event.target instanceof Element) ||
                event.target.closest(".kk-image-control")
            )
                return;
            const element = event.target.closest<HTMLElement>(
                "[data-kk-image-path]",
            );
            const widgetId =
                element?.closest<HTMLElement>("[data-feedback-id]")?.dataset
                    .feedbackId;
            setHovered(
                element && widgetId
                    ? `${widgetId}:${element.dataset.kkImagePath}`
                    : null,
            );
        };
        scan();
        window.addEventListener("pointerover", hover);
        window.addEventListener("scroll", scan, true);
        window.addEventListener("resize", scan);
        const observer = new MutationObserver((records) => {
            if (
                records.some(
                    (record) =>
                        !(
                            record.target instanceof Element &&
                            record.target.closest("[data-feedback-ui]")
                        ),
                )
            )
                scan();
        });
        observer.observe(
            document.querySelector("[data-feedback-page]") || document.body,
            { childList: true, subtree: true },
        );
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener("pointerover", hover);
            window.removeEventListener("scroll", scan, true);
            window.removeEventListener("resize", scan);
        };
    }, [index, pageId]);
    useEffect(() => {
        if (pending) return;
        setSelected((current) => {
            if (!current) return null;
            const before = currentAt(index, current.target, current.path) as
                | ImageSource
                | undefined;
            return before ? { ...current, before } : null;
        });
    }, [index, pending]);
    useEffect(() => {
        onBusy(pending);
        return () => onBusy(false);
    }, [pending, onBusy]);
    return (
        <>
            {slots.map((slot) =>
                createPortal(
                    <div
                        data-feedback-ui
                        className={`kk-image-control ${slot.before.kind === "placeholder" ? "is-placeholder" : ""} ${hovered === slot.key ? "is-hovered" : ""}`}
                        onPointerEnter={() => setHovered(slot.key)}
                        style={{
                            position: "fixed",
                            left: slot.rect.left,
                            top: slot.rect.top,
                            width: slot.rect.width,
                            height: slot.rect.height,
                            zIndex: 45,
                            pointerEvents: "none",
                        }}
                        key={slot.key}
                    >
                        <button
                            type="button"
                            className="kk-image-replace"
                            aria-keyshortcuts="Enter"
                            disabled={disabled || pending}
                            style={{ pointerEvents: "auto" }}
                            onFocus={(event) => {
                                const rect =
                                    event.currentTarget.getBoundingClientRect();
                                // Fixed portals cannot scroll their source into view on keyboard focus.
                                if (
                                    rect.top < 0 ||
                                    rect.bottom > window.innerHeight
                                ) {
                                    slot.element.scrollIntoView({
                                        block: "start",
                                        inline: "nearest",
                                    });
                                }
                            }}
                            onClick={() => setSelected(slot)}
                            aria-label={`${slot.before.kind === "placeholder" ? "Add" : "Replace"} ${slot.label}`}
                        >
                            {slot.before.kind === "placeholder"
                                ? "＋ Add image"
                                : "Replace image"}{" "}
                            <Shortcut>↵</Shortcut>
                        </button>
                    </div>,
                    document.body,
                    slot.key,
                ),
            )}
            <Dialog
                open={!!selected}
                onOpenChange={(open) => {
                    if (!open && !pending) setSelected(null);
                }}
            >
                <DialogContent
                    data-feedback-ui
                    className="max-w-md"
                    onEscapeKeyDown={(event) => {
                        if (pending) event.preventDefault();
                    }}
                    onPointerDownOutside={(event) => {
                        if (pending) event.preventDefault();
                    }}
                >
                    <DialogTitle>
                        {selected?.before.kind === "placeholder"
                            ? "Add image"
                            : "Replace image"}
                    </DialogTitle>
                    <DialogDescription>
                        {selected?.label}. This saves to the live page. Undo and
                        History keep the previous image available.
                    </DialogDescription>
                    {selected && (
                        <ImageFileInput
                            key={selected.key}
                            progress={uploadProgress}
                            onFile={async (file) => {
                                setPending(true);
                                try {
                                    const result =
                                        await maybeDownsizeImage(file);
                                    const media = await uploadFile(
                                        result.file,
                                        { type: "page" },
                                    );
                                    await onSave(
                                        selected.target,
                                        selected.path,
                                        selected.before,
                                        {
                                            kind: "media",
                                            media: media as unknown as Media,
                                        },
                                    );
                                    setSelected(null);
                                } finally {
                                    setPending(false);
                                }
                            }}
                        />
                    )}
                    {isUploading && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={cancelUpload}
                        >
                            Cancel upload
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setSelected(null)}
                    >
                        Close
                    </Button>
                </DialogContent>
            </Dialog>
        </>
    );
}
