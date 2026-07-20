import React, { useEffect, useState } from "react";
import type { Address, Media, Profile } from "@courselit/common-models";
import {
    AdminWidgetPanel,
    AdminWidgetPanelContainer,
    CssIdField,
    Form,
    FormField,
    MediaSelector,
    PageBuilderPropertyHeader,
    Select,
} from "@courselit/components-library";
import Settings, { BlockImage } from "./settings";
import * as defaults from "./defaults";

interface AdminWidgetProps {
    name: string;
    settings: Settings;
    onChange: (...args: any[]) => void;
    address: Address;
    networkAction: boolean;
    profile: Profile;
}

/**
 * Editor for one picture. The Source select switches the tagged union, so the
 * two inputs are never both live at once. Same shape as the anahata-hero
 * ImageEditor, trimmed to what this block needs.
 */
function ImageEditor({
    label,
    tooltip,
    value,
    onChange,
    profile,
    address,
}: {
    label: string;
    tooltip?: string;
    value: BlockImage;
    onChange: (image: BlockImage) => void;
    profile: Profile;
    address: Address;
}): JSX.Element {
    const media: Partial<Media> =
        value.source.kind === "media" ? value.source.media : {};
    const url = value.source.kind === "url" ? value.source.url : "";

    return (
        <div className="flex flex-col gap-2">
            <PageBuilderPropertyHeader label={label} tooltip={tooltip} />
            <Select
                title="Source"
                value={value.source.kind}
                options={[
                    { label: "URL or file path", value: "url" },
                    { label: "Media library", value: "media" },
                ]}
                onChange={(kind: "url" | "media") =>
                    onChange({
                        ...value,
                        source:
                            kind === "url"
                                ? { kind: "url", url }
                                : { kind: "media", media },
                    })
                }
            />
            {value.source.kind === "url" ? (
                <Form>
                    <FormField
                        label="Image URL"
                        placeholder="/editorial/mountains-band.jpg"
                        value={url}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            onChange({
                                ...value,
                                source: { kind: "url", url: e.target.value },
                            })
                        }
                    />
                </Form>
            ) : (
                <MediaSelector
                    title=""
                    src={media.thumbnail}
                    srcTitle={media.originalFileName}
                    profile={profile}
                    address={address}
                    onSelection={(selected: Media) => {
                        if (selected) {
                            onChange({
                                ...value,
                                source: { kind: "media", media: selected },
                            });
                        }
                    }}
                    onRemove={() =>
                        onChange({
                            ...value,
                            source: { kind: "media", media: {} },
                        })
                    }
                    strings={{}}
                    access="public"
                    mediaId={media.mediaId}
                    type="page"
                />
            )}
            <Form>
                <FormField
                    label="Alt text"
                    tooltip="Leave empty for a purely decorative image"
                    value={value.alt}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        onChange({ ...value, alt: e.target.value })
                    }
                />
            </Form>
        </div>
    );
}

export default function AdminWidget({
    settings,
    onChange,
    profile,
    address,
}: AdminWidgetProps): JSX.Element {
    const [coverImage, setCoverImage] = useState<BlockImage>(
        settings.coverImage || defaults.coverImage,
    );
    const [mountainsImage, setMountainsImage] = useState<BlockImage>(
        settings.mountainsImage || defaults.mountainsImage,
    );
    const [namasteImage, setNamasteImage] = useState<BlockImage>(
        settings.namasteImage || defaults.namasteImage,
    );
    const [portraitImage, setPortraitImage] = useState<BlockImage>(
        settings.portraitImage || defaults.portraitImage,
    );
    const [signatureImage, setSignatureImage] = useState<BlockImage>(
        settings.signatureImage || defaults.signatureImage,
    );
    const [enrolCaption, setEnrolCaption] = useState<string>(
        settings.enrolCaption ?? defaults.enrolCaption,
    );
    const [enrolAction, setEnrolAction] = useState<string>(
        settings.enrolAction ?? defaults.enrolAction,
    );
    const [cssId, setCssId] = useState(settings.cssId);

    useEffect(() => {
        onChange({
            coverImage,
            mountainsImage,
            namasteImage,
            portraitImage,
            signatureImage,
            enrolCaption,
            enrolAction,
            cssId,
        });
    }, [
        coverImage,
        mountainsImage,
        namasteImage,
        portraitImage,
        signatureImage,
        enrolCaption,
        enrolAction,
        cssId,
    ]);

    return (
        <AdminWidgetPanelContainer
            type="multiple"
            defaultValue={["images", "cta"]}
        >
            <AdminWidgetPanel title="Photographs" value="images">
                <ImageEditor
                    label="Cover photograph"
                    tooltip="Square image beside the title"
                    value={coverImage}
                    onChange={setCoverImage}
                    profile={profile}
                    address={address}
                />
                <ImageEditor
                    label="Mountains band"
                    tooltip="First full-bleed figure band"
                    value={mountainsImage}
                    onChange={setMountainsImage}
                    profile={profile}
                    address={address}
                />
                <ImageEditor
                    label="Namaste band"
                    tooltip="Second full-bleed figure band"
                    value={namasteImage}
                    onChange={setNamasteImage}
                    profile={profile}
                    address={address}
                />
                <ImageEditor
                    label="Teacher portrait"
                    tooltip="Portrait beside the profile"
                    value={portraitImage}
                    onChange={setPortraitImage}
                    profile={profile}
                    address={address}
                />
                <ImageEditor
                    label="Signature"
                    value={signatureImage}
                    onChange={setSignatureImage}
                    profile={profile}
                    address={address}
                />
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Enrol button" value="cta">
                <PageBuilderPropertyHeader
                    label="Call to action"
                    tooltip="Both Enrol buttons on the page share this target"
                />
                <Form>
                    <FormField
                        label="Button text"
                        value={enrolCaption}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setEnrolCaption(e.target.value)
                        }
                    />
                    <FormField
                        label="Button link"
                        placeholder="/checkout?type=course&id=…"
                        value={enrolAction}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setEnrolAction(e.target.value)
                        }
                    />
                </Form>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Advanced" value="advanced">
                <CssIdField value={cssId} onChange={setCssId} />
            </AdminWidgetPanel>
        </AdminWidgetPanelContainer>
    );
}
