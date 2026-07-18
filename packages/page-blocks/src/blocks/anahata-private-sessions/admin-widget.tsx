"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Address, Media, Profile } from "@courselit/common-models";
import type {
    SectionBackground,
    Theme,
    ThemeStyle,
} from "@courselit/page-models";
import {
    AdminWidgetPanel,
    AdminWidgetPanelContainer,
    Button,
    Checkbox,
    ColorSelector,
    CssIdField,
    Form,
    FormField,
    IconButton,
    MaxWidthSelector,
    MediaSelector,
    PageBuilderPropertyHeader,
    Select,
    VerticalPaddingSelector,
    SectionBackgroundPanel,
} from "@courselit/components-library";
import { Add, ArrowDownward, ArrowUpward, Delete } from "@courselit/icons";
import { generateUniqueId } from "@courselit/utils";
import Settings, { Bullet, ImageSource, PhotoPosition } from "./settings";
import * as defaults from "./defaults";

interface AdminWidgetProps {
    name: string;
    settings: Settings;
    onChange: (...args: any[]) => void;
    address: Address;
    networkAction: boolean;
    profile: Profile;
    theme: Theme;
}

/**
 * Editor for one `ImageSource`. The tag is the control: picking "Uploaded
 * media" swaps the URL field for the media picker, so the two shapes can never
 * both be half-filled.
 */
function ImageSourceField({
    label,
    tooltip,
    value,
    onChange,
    profile,
    address,
}: {
    label: string;
    tooltip?: string;
    value: ImageSource | undefined;
    onChange: (value: ImageSource) => void;
    profile: Profile;
    address: Address;
}) {
    const kind = value?.kind ?? "url";
    const media = value?.kind === "media" ? value.media : undefined;

    return (
        <div className="flex flex-col gap-2">
            <PageBuilderPropertyHeader label={label} tooltip={tooltip} />
            <Select
                title="Source"
                variant="without-label"
                value={kind}
                options={[
                    { label: "File path or URL", value: "url" },
                    { label: "Uploaded media", value: "media" },
                ]}
                onChange={(next: ImageSource["kind"]) =>
                    onChange(
                        next === "url"
                            ? {
                                  kind: "url",
                                  url: value?.kind === "url" ? value.url : "",
                              }
                            : {
                                  kind: "media",
                                  media: (media || {}) as Media,
                              },
                    )
                }
            />
            {kind === "url" ? (
                <Form>
                    <FormField
                        label="Path"
                        value={value?.kind === "url" ? value.url : ""}
                        placeholder="/anahata/swami-kk-bio.jpg"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            onChange({ kind: "url", url: e.target.value })
                        }
                    />
                </Form>
            ) : (
                <MediaSelector
                    title=""
                    src={media?.thumbnail || ""}
                    srcTitle={media?.originalFileName || ""}
                    profile={profile}
                    address={address}
                    onSelection={(selected: Media) =>
                        selected && onChange({ kind: "media", media: selected })
                    }
                    onRemove={() =>
                        onChange({ kind: "media", media: {} as Media })
                    }
                    strings={{}}
                    access="public"
                    mediaId={media?.mediaId}
                    type="page"
                />
            )}
        </div>
    );
}

/** Reorderable list of plain-text bullets. */
function BulletsEditor({
    bullets,
    onChange,
}: {
    bullets: Bullet[];
    onChange: (bullets: Bullet[]) => void;
}) {
    const move = (index: number, delta: number) => {
        const target = index + delta;
        if (target < 0 || target >= bullets.length) {
            return;
        }
        const next = [...bullets];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    };

    return (
        <div className="flex flex-col gap-4">
            {bullets.map((bullet, index) => (
                <div key={bullet.id} className="flex flex-col gap-1">
                    <Form>
                        <FormField
                            component="textarea"
                            rows={3}
                            label={`Bullet ${index + 1}`}
                            value={bullet.text}
                            onChange={(
                                e: React.ChangeEvent<HTMLTextAreaElement>,
                            ) =>
                                onChange(
                                    bullets.map((b) =>
                                        b.id === bullet.id
                                            ? { ...b, text: e.target.value }
                                            : b,
                                    ),
                                )
                            }
                        />
                    </Form>
                    <div className="flex items-center gap-1">
                        <IconButton
                            aria-label={`Move bullet ${index + 1} up`}
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                        >
                            <ArrowUpward />
                        </IconButton>
                        <IconButton
                            aria-label={`Move bullet ${index + 1} down`}
                            disabled={index === bullets.length - 1}
                            onClick={() => move(index, 1)}
                        >
                            <ArrowDownward />
                        </IconButton>
                        <IconButton
                            aria-label={`Delete bullet ${index + 1}`}
                            onClick={() =>
                                onChange(
                                    bullets.filter((b) => b.id !== bullet.id),
                                )
                            }
                        >
                            <Delete />
                        </IconButton>
                    </div>
                </div>
            ))}
            <div>
                <Button
                    component="button"
                    onClick={() =>
                        onChange([
                            ...bullets,
                            { id: generateUniqueId(), text: "New bullet" },
                        ])
                    }
                >
                    <span className="flex items-center gap-1">
                        <Add /> Add bullet
                    </span>
                </Button>
            </div>
        </div>
    );
}

export default function AdminWidget({
    settings,
    onChange,
    profile,
    address,
    theme,
}: AdminWidgetProps): JSX.Element {
    const seededBullets = useMemo<Bullet[]>(
        () =>
            // Only an absent list seeds the defaults; an empty one is a
            // deliberate "no bullets" and must survive a reopen.
            settings.bullets ??
            defaults.bulletTexts.map((text) => ({
                id: generateUniqueId(),
                text,
            })),
        // Seed once; later edits flow through `setBullets`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const [photo, setPhoto] = useState<ImageSource>(
        settings.photo || defaults.photo,
    );
    const [photoAlt, setPhotoAlt] = useState(
        settings.photoAlt ?? defaults.photoAlt,
    );
    const [photoWidth, setPhotoWidth] = useState(
        settings.photoWidth ?? defaults.photoWidth,
    );
    const [photoHeight, setPhotoHeight] = useState(
        settings.photoHeight ?? defaults.photoHeight,
    );
    const [decorImage, setDecorImage] = useState<ImageSource>(
        settings.decorImage || defaults.decorImage,
    );
    const [showDecorImage, setShowDecorImage] = useState(
        settings.showDecorImage ?? defaults.showDecorImage,
    );
    const [lead, setLead] = useState(settings.lead ?? defaults.lead);
    const [bullets, setBullets] = useState<Bullet[]>(seededBullets);
    const [buttonCaption, setButtonCaption] = useState(
        settings.buttonCaption ?? defaults.buttonCaption,
    );
    const [buttonAction, setButtonAction] = useState(
        settings.buttonAction ?? defaults.buttonAction,
    );
    const [buttonOpensInNewTab, setButtonOpensInNewTab] = useState(
        settings.buttonOpensInNewTab ?? defaults.buttonOpensInNewTab,
    );
    const [photoPosition, setPhotoPosition] = useState<PhotoPosition>(
        settings.photoPosition ?? defaults.photoPosition,
    );
    const [panelColor, setPanelColor] = useState(
        settings.panelColor ?? defaults.panelColor,
    );
    const [leadColor, setLeadColor] = useState(
        settings.leadColor ?? defaults.leadColor,
    );
    const [textColor, setTextColor] = useState(
        settings.textColor ?? defaults.textColor,
    );
    const [buttonColor, setButtonColor] = useState(
        settings.buttonColor ?? defaults.buttonColor,
    );
    const [buttonHoverColor, setButtonHoverColor] = useState(
        settings.buttonHoverColor ?? defaults.buttonHoverColor,
    );
    const [buttonTextColor, setButtonTextColor] = useState(
        settings.buttonTextColor ?? defaults.buttonTextColor,
    );
    const [maxWidth, setMaxWidth] = useState<
        ThemeStyle["structure"]["page"]["width"]
    >(settings.maxWidth || defaults.maxWidth);
    const [verticalPadding, setVerticalPadding] = useState<
        ThemeStyle["structure"]["section"]["padding"]["y"]
    >(settings.verticalPadding || defaults.verticalPadding);
    const [background, setBackground] = useState<SectionBackground>(
        settings.background as SectionBackground,
    );
    const [cssId, setCssId] = useState(settings.cssId);

    useEffect(() => {
        onChange({
            photo,
            photoAlt,
            photoWidth,
            photoHeight,
            decorImage,
            showDecorImage,
            lead,
            bullets,
            buttonCaption,
            buttonAction,
            buttonOpensInNewTab,
            photoPosition,
            panelColor,
            leadColor,
            textColor,
            buttonColor,
            buttonHoverColor,
            buttonTextColor,
            maxWidth,
            verticalPadding,
            background,
            cssId,
        });
    }, [
        photo,
        photoAlt,
        photoWidth,
        photoHeight,
        decorImage,
        showDecorImage,
        lead,
        bullets,
        buttonCaption,
        buttonAction,
        buttonOpensInNewTab,
        photoPosition,
        panelColor,
        leadColor,
        textColor,
        buttonColor,
        buttonHoverColor,
        buttonTextColor,
        maxWidth,
        verticalPadding,
        background,
        cssId,
    ]);

    return (
        <AdminWidgetPanelContainer
            type="multiple"
            defaultValue={["copy", "bullets", "cta"]}
        >
            <AdminWidgetPanel title="Copy" value="copy">
                <Form>
                    <FormField
                        component="textarea"
                        rows={4}
                        label="Lead line"
                        tooltip="The rust heading above the bullets."
                        value={lead}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                            setLead(e.target.value)
                        }
                    />
                </Form>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Bullets" value="bullets">
                <BulletsEditor bullets={bullets} onChange={setBullets} />
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Call to action" value="cta">
                <Form>
                    <FormField
                        label="Button caption"
                        value={buttonCaption}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setButtonCaption(e.target.value)
                        }
                    />
                    <FormField
                        label="Button link"
                        placeholder="#"
                        value={buttonAction}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setButtonAction(e.target.value)
                        }
                    />
                </Form>
                <div className="flex items-center justify-between">
                    <PageBuilderPropertyHeader label="Open in a new tab" />
                    <Checkbox
                        checked={buttonOpensInNewTab}
                        onChange={(value: boolean) =>
                            setButtonOpensInNewTab(value)
                        }
                    />
                </div>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Images" value="images">
                <ImageSourceField
                    label="Photograph"
                    tooltip="Shown beside the copy; fills its half of the block."
                    value={photo}
                    onChange={setPhoto}
                    profile={profile}
                    address={address}
                />
                <Form>
                    <FormField
                        label="Photograph alt text"
                        tooltip="Leave empty if the photograph is purely decorative."
                        value={photoAlt}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setPhotoAlt(e.target.value)
                        }
                    />
                    <FormField
                        label="Photograph intrinsic width (px)"
                        type="number"
                        value={photoWidth}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setPhotoWidth(
                                Number(e.target.value) || defaults.photoWidth,
                            )
                        }
                    />
                    <FormField
                        label="Photograph intrinsic height (px)"
                        type="number"
                        value={photoHeight}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setPhotoHeight(
                                Number(e.target.value) || defaults.photoHeight,
                            )
                        }
                    />
                </Form>
                <div className="flex items-center justify-between">
                    <PageBuilderPropertyHeader
                        label="Show the corner ornament"
                        tooltip="A decorative image anchored to the bottom-right of the copy panel."
                    />
                    <Checkbox
                        checked={showDecorImage}
                        onChange={(value: boolean) => setShowDecorImage(value)}
                    />
                </div>
                {showDecorImage && (
                    <ImageSourceField
                        label="Corner ornament"
                        value={decorImage}
                        onChange={setDecorImage}
                        profile={profile}
                        address={address}
                    />
                )}
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Design" value="design">
                <Select
                    title="Photograph position"
                    value={photoPosition}
                    options={[
                        { label: "Left", value: "left" },
                        { label: "Right", value: "right" },
                    ]}
                    onChange={(value: PhotoPosition) => setPhotoPosition(value)}
                    subtitle="Applies from 768px up; below that the photograph always sits above the copy."
                />
                <ColorSelector
                    title="Panel background"
                    value={panelColor}
                    onChange={(value?: string) =>
                        setPanelColor(value || defaults.panelColor)
                    }
                />
                <ColorSelector
                    title="Lead line"
                    value={leadColor}
                    onChange={(value?: string) =>
                        setLeadColor(value || defaults.leadColor)
                    }
                />
                <ColorSelector
                    title="Bullet text"
                    value={textColor}
                    onChange={(value?: string) =>
                        setTextColor(value || defaults.textColor)
                    }
                />
                <ColorSelector
                    title="Button background"
                    value={buttonColor}
                    onChange={(value?: string) =>
                        setButtonColor(value || defaults.buttonColor)
                    }
                />
                <ColorSelector
                    title="Button hover / focus"
                    value={buttonHoverColor}
                    onChange={(value?: string) =>
                        setButtonHoverColor(value || defaults.buttonHoverColor)
                    }
                />
                <ColorSelector
                    title="Button text"
                    value={buttonTextColor}
                    onChange={(value?: string) =>
                        setButtonTextColor(value || defaults.buttonTextColor)
                    }
                />
                <MaxWidthSelector
                    value={maxWidth || theme.theme.structure.page.width}
                    onChange={setMaxWidth}
                />
                <VerticalPaddingSelector
                    value={
                        verticalPadding ||
                        theme.theme.structure.section.padding.y
                    }
                    onChange={setVerticalPadding}
                />
                <SectionBackgroundPanel
                    value={background}
                    onChange={setBackground}
                    profile={profile}
                    address={address}
                />
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Advanced" value="advanced">
                <CssIdField value={cssId} onChange={setCssId} />
            </AdminWidgetPanel>
        </AdminWidgetPanelContainer>
    );
}
