"use client";

import { useRef } from "react";
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
    onChange: (photo: ContactPreferencesInput["photo"]) => void;
    onError: (message: string) => void;
}

export default function PhotoPicker({
    photo,
    action,
    readOnly,
    onChange,
    onError,
}: Props) {
    const input = useRef<HTMLInputElement>(null);
    const selection = useRef(0);
    const src =
        action.kind === "replace"
            ? `data:image/jpeg;base64,${action.data}`
            : action.kind !== "remove" && photo.kind === "shared"
              ? `/api/contact-preferences/photo?v=${photo.version}`
              : undefined;

    async function select(file?: File) {
        if (!file || readOnly) return;
        const selected = ++selection.current;
        if (
            !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
            file.size > 2 * 1024 * 1024
        ) {
            onError(copy.photoError);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            if (
                selected === selection.current &&
                typeof reader.result === "string"
            ) {
                onChange({
                    kind: "replace",
                    data: reader.result.split(",")[1],
                });
                onError("");
            }
        };
        reader.onerror = () => {
            if (selected === selection.current) onError(copy.photoError);
        };
        reader.readAsDataURL(file);
    }

    return (
        <section className="space-y-3" aria-labelledby="private-photo-title">
            <h3 id="private-photo-title" className="font-semibold">
                {copy.photo}
            </h3>
            <p className="text-sm text-muted-foreground">{copy.photoNote}</p>
            {src ? (
                <Image
                    unoptimized
                    width={128}
                    height={128}
                    src={src}
                    alt={copy.photoAlt}
                    className="h-32 w-32 rounded-lg object-cover"
                />
            ) : (
                <p>{copy.noPhoto}</p>
            )}
            {!readOnly && (
                <>
                    <label
                        className="block min-h-11"
                        htmlFor="private-photo-input"
                    >
                        {copy.choosePhoto}
                    </label>
                    <input
                        ref={input}
                        id="private-photo-input"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="block min-h-11 max-w-full"
                        onChange={(event) =>
                            void select(event.target.files?.[0])
                        }
                    />
                    <p className="text-sm text-muted-foreground">
                        {copy.photoHelp}
                    </p>
                    {src && (
                        <button
                            type="button"
                            className="min-h-11 underline"
                            onClick={() => {
                                selection.current++;
                                onChange({ kind: "remove" });
                                if (input.current) input.current.value = "";
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
