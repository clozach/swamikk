"use client";

import React, { useEffect, useId, useRef, useState } from "react";

export const IMAGE_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/gif",
];

/** Shared by the picker and direct page drops, before either starts an upload. */
export function imageFileError(
    file: File,
    accept = IMAGE_MIME_TYPES,
    maxBytes = 50 * 1024 * 1024,
): string | undefined {
    if (!accept.includes(file.type))
        return "Choose a JPEG, PNG, WebP, AVIF or GIF image supported by this field.";
    if (file.size > maxBytes)
        return `This image is too large. Choose one under ${Math.round(maxBytes / 1024 / 1024)} MB.`;
}

/** One acquisition surface. The caller resolves only after the image is saved. */
export function ImageFileInput({
    onFile,
    disabled = false,
    progress,
    label = "Choose image",
    accept = IMAGE_MIME_TYPES,
    maxBytes = 50 * 1024 * 1024,
    onError,
    savedMessage = "Image saved.",
    preview,
    previewLabel = "Replace image",
}: {
    onFile: (file: File) => Promise<void>;
    disabled?: boolean;
    progress?: number;
    label?: string;
    accept?: string[];
    maxBytes?: number;
    onError?: (message: string) => void;
    savedMessage?: string;
    preview?: React.ReactNode;
    previewLabel?: string;
}) {
    const id = useId();
    const input = useRef<HTMLInputElement>(null);
    const zone = useRef<HTMLDivElement>(null);
    const busy = useRef(false);
    const mounted = useRef(true);
    const [state, setState] = useState<{
        kind: "idle" | "saving" | "saved" | "error";
        message: string;
    }>({
        kind: "idle",
        message: "Paste an image here, drop a file, or choose one.",
    });
    const [dragging, setDragging] = useState(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const report = (message: string) => {
        if (mounted.current) setState({ kind: "error", message });
        onError?.(message);
    };
    async function select(file?: File) {
        if (!mounted.current || !file || disabled || busy.current) return;
        const error = imageFileError(file, accept, maxBytes);
        if (error) return report(error);
        busy.current = true;
        setState({
            kind: "saving",
            message: `Saving ${file.name || "image"}…`,
        });
        onError?.("");
        try {
            await onFile(file);
            if (mounted.current)
                setState({ kind: "saved", message: savedMessage });
        } catch (error) {
            report(
                error instanceof Error
                    ? error.message
                    : "The image could not be saved. Please try again.",
            );
        } finally {
            busy.current = false;
            if (input.current) input.current.value = "";
        }
    }
    async function paste() {
        if (disabled || busy.current) return;
        zone.current?.focus();
        if (!navigator.clipboard?.read) {
            setState({
                kind: "idle",
                message: "Press ⌘V or Ctrl+V here to paste an image.",
            });
            return;
        }
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const type = item.types.find((value) => accept.includes(value));
                if (type) {
                    const blob = await item.getType(type);
                    await select(
                        new File([blob], `pasted-image.${type.split("/")[1]}`, {
                            type,
                        }),
                    );
                    return;
                }
            }
            report("Copy an image first, then paste it here.");
        } catch {
            setState({
                kind: "idle",
                message: "Press ⌘V or Ctrl+V here to paste an image.",
            });
        }
    }
    const working = state.kind === "saving";
    return (
        <div
            ref={zone}
            tabIndex={disabled ? -1 : 0}
            role="group"
            aria-label={label}
            aria-busy={working}
            className={`rounded-lg border-2 border-dashed p-5 text-center focus-visible:outline focus-visible:outline-2 ${dragging ? "border-primary bg-muted" : "border-border"}`}
            onKeyDown={(event) => {
                if (
                    event.target === event.currentTarget &&
                    (event.key === "Enter" || event.key === " ") &&
                    !disabled &&
                    !working
                ) {
                    event.preventDefault();
                    input.current?.click();
                }
            }}
            onPaste={(event) => {
                const file = Array.from(event.clipboardData.files).find(
                    (item) => item.type.startsWith("image/"),
                );
                if (file) {
                    event.preventDefault();
                    void select(file);
                }
            }}
            onDragOver={(event) => {
                event.preventDefault();
                if (!disabled && !busy.current) {
                    event.dataTransfer.dropEffect = "copy";
                    setDragging(true);
                }
            }}
            onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                    setDragging(false);
            }}
            onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (event.dataTransfer.files.length !== 1)
                    report("Drop one image at a time.");
                else void select(event.dataTransfer.files[0]);
            }}
        >
            <input
                ref={input}
                id={id}
                type="file"
                aria-label={label}
                accept={accept.join(",")}
                disabled={disabled || working}
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => void select(event.target.files?.[0])}
            />
            {preview && (
                <button
                    type="button"
                    disabled={disabled || working}
                    onClick={() => input.current?.click()}
                    aria-label={previewLabel}
                    className="group relative mx-auto mb-4 block overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2"
                >
                    {preview}
                    <span className="absolute inset-x-0 bottom-0 bg-black/75 px-2 py-2 text-sm text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
                        {previewLabel}
                    </span>
                </button>
            )}
            <div className="flex flex-wrap justify-center gap-2">
                <button
                    className="min-h-11 rounded-md border border-border bg-background px-4 py-2 font-medium focus-visible:outline focus-visible:outline-2 disabled:opacity-50"
                    type="button"
                    disabled={disabled || working}
                    onClick={() => input.current?.click()}
                >
                    {label}
                </button>
                <button
                    className="min-h-11 rounded-md border border-border bg-background px-4 py-2 font-medium focus-visible:outline focus-visible:outline-2 disabled:opacity-50"
                    type="button"
                    disabled={disabled || working}
                    onClick={() => void paste()}
                >
                    Paste image
                </button>
            </div>
            <p
                className="mt-3 text-sm"
                role={state.kind === "error" ? "alert" : "status"}
            >
                {state.message}
            </p>
            {working && progress !== undefined && (
                <progress
                    aria-label="Image upload progress"
                    className="mt-2 w-full"
                    value={progress}
                    max={100}
                />
            )}
        </div>
    );
}
