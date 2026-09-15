"use client";

import { useEffect, useRef, useState } from "react";
import {
    ImageFileInput,
    maybeDownsizeImage,
} from "@courselit/components-library/images";
import Image from "next/image";
import type {
    ContactPreferences,
    ContactPreferencesInput,
} from "@courselit/common-models";
import { contactPreferencesCopy as copy } from "@/config/strings";

interface Props {
    photo: ContactPreferences["photo"];
    action: ContactPreferencesInput["photo"];
    readOnly: boolean;
    onChange: (photo: ContactPreferencesInput["photo"]) => void | Promise<void>;
    onError: (message: string) => void;
}

export default function PhotoPicker({
    photo,
    action,
    readOnly,
    onChange,
    onError,
}: Props) {
    const [removing, setRemoving] = useState(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const src =
        action.kind === "replace"
            ? `data:image/jpeg;base64,${action.data}`
            : action.kind !== "remove" && photo.kind === "shared"
              ? `/api/contact-preferences/photo?v=${photo.version}`
              : undefined;

    async function select(file: File) {
        if (readOnly) return;
        const result = await maybeDownsizeImage(file, {
            maxDimension: 1024,
            softByteLimit: 500 * 1024,
        });
        if (result.file.size > 2 * 1024 * 1024)
            throw new Error(copy.photoError);
        const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
                typeof reader.result === "string"
                    ? resolve(reader.result.split(",")[1])
                    : reject(new Error(copy.photoError));
            reader.onerror = () => reject(new Error(copy.photoError));
            reader.readAsDataURL(result.file);
        });
        if (!mounted.current)
            throw new DOMException("Photo selection cancelled.", "AbortError");
        await onChange({ kind: "replace", data });
    }

    const preview = src ? (
        <Image
            unoptimized
            width={128}
            height={128}
            src={src}
            alt={copy.photoAlt}
            className="h-32 w-32 rounded-lg object-cover"
        />
    ) : (
        <span className="flex h-32 w-32 items-center justify-center rounded-lg bg-muted p-3 text-sm">
            {copy.noPhoto}
        </span>
    );

    return (
        <section className="space-y-3" aria-labelledby="private-photo-title">
            <h3 id="private-photo-title" className="font-semibold">
                {copy.photo}
            </h3>
            <p className="text-sm text-muted-foreground">{copy.photoNote}</p>
            {readOnly && preview}
            {!readOnly && (
                <>
                    <ImageFileInput
                        preview={preview}
                        previewLabel={src ? "Replace photo" : copy.choosePhoto}
                        label={copy.choosePhoto}
                        accept={["image/jpeg", "image/png", "image/webp"]}
                        disabled={removing}
                        onFile={select}
                        onError={onError}
                    />
                    <p className="text-sm text-muted-foreground">
                        {copy.photoHelp}
                    </p>
                    {src && (
                        <button
                            type="button"
                            className="min-h-11 underline"
                            disabled={removing}
                            onClick={async () => {
                                setRemoving(true);
                                try {
                                    await onChange({ kind: "remove" });
                                } catch (error) {
                                    onError(
                                        error instanceof Error
                                            ? error.message
                                            : copy.photoError,
                                    );
                                } finally {
                                    setRemoving(false);
                                }
                            }}
                        >
                            {copy.removePhoto}
                        </button>
                    )}
                </>
            )}
        </section>
    );
}
