"use client";

import React, { useState } from "react";
import type { Address, Media, Profile } from "@courselit/common-models";
import {
    Form,
    FormField,
    MediaSelector,
    PageBuilderPropertyHeader,
    Select,
} from "@courselit/components-library";
import type { ImageSource, ImageSourceKind } from "./image-source";

type MediaSelectorProps = React.ComponentProps<typeof MediaSelector>;

export interface ImageSourceFieldProps {
    value?: ImageSource;
    onChange: (next: ImageSource) => void;
    /** Panel header. Omit to render the control bare (inside another panel). */
    label?: string;
    tooltip?: string;
    /** Placeholder shown in the URL input, e.g. "/anahata/swami-kk-bio.jpg". */
    urlPlaceholder?: string;
    access?: MediaSelectorProps["access"];
    /** Which media bucket the library dialog browses. Default "page". */
    mediaType?: MediaSelectorProps["type"];
    profile: Profile;
    address: Address;
}

const KIND_OPTIONS: { label: string; value: ImageSourceKind }[] = [
    { label: "URL or file path", value: "url" },
    { label: "Media library", value: "media" },
    { label: "Placeholder (waiting for asset)", value: "placeholder" },
];

interface Arms {
    url: string;
    media: Partial<Media>;
    description: string;
}

const armsFrom = (value: ImageSource | undefined, prior?: Arms): Arms => ({
    url: value?.kind === "url" ? value.url : (prior?.url ?? ""),
    media: value?.kind === "media" ? value.media : (prior?.media ?? {}),
    description:
        value?.kind === "placeholder"
            ? value.description
            : (prior?.description ?? ""),
});

/**
 * The one admin control for an `ImageSource`: a three-way Select (URL ·
 * Library · Placeholder) whose choice IS the tag, so the arms can never be
 * half-filled together. Switching kinds carries the other arms in local
 * memory, so a round trip through "Placeholder" does not lose the URL that
 * was typed before it.
 */
export function ImageSourceField({
    value,
    onChange,
    label,
    tooltip,
    urlPlaceholder = "/anahata/photo.jpg",
    access = "public",
    mediaType = "page",
    profile,
    address,
}: ImageSourceFieldProps) {
    const [remembered, setRemembered] = useState<Arms>(() => armsFrom(value));
    const arms = armsFrom(value, remembered);
    const kind: ImageSourceKind = value?.kind ?? "url";

    const emit = (next: ImageSource) => {
        setRemembered(armsFrom(next, arms));
        onChange(next);
    };

    const switchKind = (next: ImageSourceKind) => {
        if (next === kind) return;
        emit(
            next === "url"
                ? { kind: "url", url: arms.url }
                : next === "media"
                  ? { kind: "media", media: arms.media }
                  : { kind: "placeholder", description: arms.description },
        );
    };

    return (
        <div className="flex flex-col gap-2">
            {label ? (
                <PageBuilderPropertyHeader label={label} tooltip={tooltip} />
            ) : null}
            <Select
                title="Source"
                variant="without-label"
                value={kind}
                options={KIND_OPTIONS}
                onChange={switchKind}
            />
            {kind === "url" ? (
                <Form>
                    <FormField
                        label="Path"
                        value={arms.url}
                        placeholder={urlPlaceholder}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            emit({ kind: "url", url: e.target.value })
                        }
                    />
                </Form>
            ) : kind === "media" ? (
                <MediaSelector
                    title=""
                    src={arms.media?.thumbnail || ""}
                    srcTitle={arms.media?.originalFileName || ""}
                    profile={profile}
                    address={address}
                    onSelection={(selected: Media) =>
                        selected && emit({ kind: "media", media: selected })
                    }
                    onRemove={() => emit({ kind: "media", media: {} })}
                    strings={{}}
                    access={access}
                    mediaId={arms.media?.mediaId}
                    type={mediaType}
                />
            ) : (
                <Form>
                    <FormField
                        component="textarea"
                        rows={3}
                        label="Description (what the final photo should show)"
                        tooltip="Shown inside the well until the real image arrives; it is also the well's alt text and hover title."
                        value={arms.description}
                        placeholder="e.g. Swami Karma Karuna seated on the deck at dawn, mist over the valley behind"
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                            emit({
                                kind: "placeholder",
                                description: e.target.value,
                            })
                        }
                    />
                </Form>
            )}
        </div>
    );
}

export default ImageSourceField;
