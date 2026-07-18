import React, { useEffect, useState } from "react";
import type { Address, Media, Profile } from "@courselit/common-models";
import type {
    Theme,
    ThemeStyle,
    SectionBackground,
} from "@courselit/page-models";
import {
    AdminWidgetPanel,
    AdminWidgetPanelContainer,
    Button,
    ColorSelector,
    CssIdField,
    Form,
    FormField,
    MaxWidthSelector,
    MediaSelector,
    PageBuilderPropertyHeader,
    PageBuilderSlider,
    SectionBackgroundPanel,
    Select,
    VerticalPaddingSelector,
} from "@courselit/components-library";
import Settings, {
    BannerFit,
    BannerPosition,
    CtaStyle,
    HeroAnimation,
    HeroImage,
    HeroParagraph,
} from "./settings";
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
 * Editor for one picture. The Source select is what switches the tagged
 * union, so the two inputs are never both live at once.
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
    value: HeroImage;
    onChange: (image: HeroImage) => void;
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
                        placeholder="/anahata/hero-silentmed.jpg"
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

/** Editor for one body paragraph plus its optional inline link. */
function ParagraphEditor({
    index,
    total,
    paragraph,
    onChange,
    onMove,
    onRemove,
}: {
    index: number;
    total: number;
    paragraph: HeroParagraph;
    onChange: (paragraph: HeroParagraph) => void;
    onMove: (from: number, to: number) => void;
    onRemove: (index: number) => void;
}): JSX.Element {
    const linkMissing = Boolean(
        paragraph.linkText && !paragraph.text.includes(paragraph.linkText),
    );

    return (
        <div className="flex flex-col gap-2 border border-slate-200 rounded p-3">
            <div className="flex items-center justify-between">
                <p className="font-semibold">Paragraph {index + 1}</p>
                <div className="flex gap-1">
                    <Button
                        component="button"
                        variant="soft"
                        disabled={index === 0}
                        onClick={() => onMove(index, index - 1)}
                    >
                        Up
                    </Button>
                    <Button
                        component="button"
                        variant="soft"
                        disabled={index === total - 1}
                        onClick={() => onMove(index, index + 1)}
                    >
                        Down
                    </Button>
                    <Button
                        component="button"
                        variant="soft"
                        onClick={() => onRemove(index)}
                    >
                        Remove
                    </Button>
                </div>
            </div>
            <Form>
                <FormField
                    label="Text"
                    component="textarea"
                    rows={5}
                    value={paragraph.text}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        onChange({ ...paragraph, text: e.target.value })
                    }
                />
                <FormField
                    label="Link text (optional)"
                    tooltip="Must appear verbatim inside the paragraph above; the first match becomes a link"
                    value={paragraph.linkText || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        onChange({ ...paragraph, linkText: e.target.value })
                    }
                />
                <FormField
                    label="Link URL"
                    placeholder="#"
                    value={paragraph.linkHref || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        onChange({ ...paragraph, linkHref: e.target.value })
                    }
                />
            </Form>
            {linkMissing && (
                <p className="text-sm text-red-600">
                    That link text is not in the paragraph, so it will render as
                    plain text.
                </p>
            )}
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
    /* ---- banner ---- */
    const [bannerImage, setBannerImage] = useState<HeroImage>(
        settings.bannerImage || defaults.bannerImage,
    );
    const [bannerFit, setBannerFit] = useState<BannerFit>(
        settings.bannerFit || defaults.bannerFit,
    );
    const [bannerPosition, setBannerPosition] = useState<BannerPosition>(
        settings.bannerPosition || defaults.bannerPosition,
    );
    const [bannerAspectRatio, setBannerAspectRatio] = useState<string>(
        settings.bannerAspectRatio || defaults.bannerAspectRatio,
    );
    const [bannerMinHeight, setBannerMinHeight] = useState<number>(
        settings.bannerMinHeight ?? defaults.bannerMinHeight,
    );
    const [wordmark, setWordmark] = useState<HeroImage>(
        settings.wordmark || defaults.wordmark,
    );
    const [wordmarkMaxWidth, setWordmarkMaxWidth] = useState<number>(
        settings.wordmarkMaxWidth ?? defaults.wordmarkMaxWidth,
    );
    const [animation, setAnimation] = useState<HeroAnimation>(
        settings.animation || defaults.animation,
    );

    /* ---- welcome row ---- */
    const [heading, setHeading] = useState<string>(
        settings.heading ?? defaults.heading,
    );
    const [paragraphs, setParagraphs] = useState<HeroParagraph[]>(
        settings.paragraphs || defaults.paragraphs,
    );
    const [photo, setPhoto] = useState<HeroImage>(
        settings.photo || defaults.photo,
    );
    const [photoOffsetTop, setPhotoOffsetTop] = useState<number>(
        settings.photoOffsetTop ?? defaults.photoOffsetTop,
    );
    const [ctaCaption, setCtaCaption] = useState<string>(
        settings.ctaCaption ?? defaults.ctaCaption,
    );
    const [ctaAction, setCtaAction] = useState<string>(
        settings.ctaAction ?? defaults.ctaAction,
    );
    const [ctaStyle, setCtaStyle] = useState<CtaStyle>(
        settings.ctaStyle || defaults.ctaStyle,
    );

    /* ---- design ---- */
    const [groundColor, setGroundColor] = useState<string>(
        settings.groundColor || defaults.groundColor,
    );
    const [headingColor, setHeadingColor] = useState<string>(
        settings.headingColor || defaults.headingColor,
    );
    const [bodyColor, setBodyColor] = useState<string>(
        settings.bodyColor || defaults.bodyColor,
    );
    const [linkColor, setLinkColor] = useState<string>(
        settings.linkColor || defaults.linkColor,
    );
    const [linkHoverColor, setLinkHoverColor] = useState<string>(
        settings.linkHoverColor || defaults.linkHoverColor,
    );
    const [maxWidth, setMaxWidth] = useState<
        ThemeStyle["structure"]["page"]["width"]
    >(settings.maxWidth);
    const [verticalPadding, setVerticalPadding] = useState<
        ThemeStyle["structure"]["section"]["padding"]["y"]
    >(settings.verticalPadding);
    const [background, setBackground] = useState<SectionBackground>(
        settings.background,
    );
    const [cssId, setCssId] = useState(settings.cssId);

    useEffect(() => {
        onChange({
            bannerImage,
            bannerFit,
            bannerPosition,
            bannerAspectRatio,
            bannerMinHeight,
            wordmark,
            wordmarkMaxWidth,
            animation,
            heading,
            paragraphs,
            photo,
            photoOffsetTop,
            ctaCaption,
            ctaAction,
            ctaStyle,
            groundColor,
            headingColor,
            bodyColor,
            linkColor,
            linkHoverColor,
            maxWidth,
            verticalPadding,
            background,
            cssId,
        });
    }, [
        bannerImage,
        bannerFit,
        bannerPosition,
        bannerAspectRatio,
        bannerMinHeight,
        wordmark,
        wordmarkMaxWidth,
        animation,
        heading,
        paragraphs,
        photo,
        photoOffsetTop,
        ctaCaption,
        ctaAction,
        ctaStyle,
        groundColor,
        headingColor,
        bodyColor,
        linkColor,
        linkHoverColor,
        maxWidth,
        verticalPadding,
        background,
        cssId,
    ]);

    const updateParagraph = (index: number, paragraph: HeroParagraph) => {
        setParagraphs(
            paragraphs.map((existing, i) =>
                i === index ? paragraph : existing,
            ),
        );
    };

    const moveParagraph = (from: number, to: number) => {
        if (to < 0 || to >= paragraphs.length) {
            return;
        }
        const reordered = [...paragraphs];
        const [moved] = reordered.splice(from, 1);
        reordered.splice(to, 0, moved);
        setParagraphs(reordered);
    };

    const removeParagraph = (index: number) => {
        setParagraphs(paragraphs.filter((_, i) => i !== index));
    };

    const addParagraph = () => {
        setParagraphs([...paragraphs, { text: "" }]);
    };

    return (
        <AdminWidgetPanelContainer
            type="multiple"
            defaultValue={["banner", "welcome", "paragraphs"]}
        >
            <AdminWidgetPanel title="Banner" value="banner">
                <ImageEditor
                    label="Banner image"
                    tooltip="The full-width photograph behind the wordmark"
                    value={bannerImage}
                    onChange={setBannerImage}
                    profile={profile}
                    address={address}
                />
                <ImageEditor
                    label="Wordmark overlay"
                    tooltip="Centred over the banner; clear the URL to hide it"
                    value={wordmark}
                    onChange={setWordmark}
                    profile={profile}
                    address={address}
                />
                <PageBuilderSlider
                    title="Wordmark max width"
                    value={wordmarkMaxWidth}
                    onChange={(value?: number) =>
                        setWordmarkMaxWidth(value ?? defaults.wordmarkMaxWidth)
                    }
                    min={200}
                    max={1200}
                    unit="px"
                />
                <Form>
                    <FormField
                        label="Banner aspect ratio"
                        tooltip='A CSS aspect-ratio value, e.g. "1920 / 947"'
                        value={bannerAspectRatio}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setBannerAspectRatio(e.target.value)
                        }
                    />
                </Form>
                <PageBuilderSlider
                    title="Banner minimum height"
                    tooltip="Keeps the banner readable on narrow screens"
                    value={bannerMinHeight}
                    onChange={(value?: number) =>
                        setBannerMinHeight(value ?? defaults.bannerMinHeight)
                    }
                    min={0}
                    max={600}
                    unit="px"
                />
                <Select
                    title="Banner fit"
                    value={bannerFit}
                    options={[
                        { label: "Cover (fill the band)", value: "cover" },
                        { label: "Contain (show it all)", value: "contain" },
                    ]}
                    onChange={(value: BannerFit) => setBannerFit(value)}
                />
                <Select
                    title="Banner focal point"
                    value={bannerPosition}
                    options={[
                        { label: "Center", value: "center" },
                        { label: "Top", value: "top" },
                        { label: "Bottom", value: "bottom" },
                        { label: "Left", value: "left" },
                        { label: "Right", value: "right" },
                        { label: "Top left", value: "top left" },
                        { label: "Top right", value: "top right" },
                        { label: "Bottom left", value: "bottom left" },
                        { label: "Bottom right", value: "bottom right" },
                    ]}
                    onChange={(value: BannerPosition) =>
                        setBannerPosition(value)
                    }
                />
                <Select
                    title="Entrance"
                    value={animation}
                    options={[
                        { label: "Fade in", value: "fade" },
                        { label: "None", value: "none" },
                    ]}
                    onChange={(value: HeroAnimation) => setAnimation(value)}
                />
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Welcome" value="welcome">
                <Form>
                    <FormField
                        label="Heading"
                        value={heading}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setHeading(e.target.value)
                        }
                    />
                </Form>
                <ImageEditor
                    label="Photo"
                    tooltip="Sits to the left of the copy on desktop, above it on mobile"
                    value={photo}
                    onChange={setPhoto}
                    profile={profile}
                    address={address}
                />
                <PageBuilderSlider
                    title="Photo top offset (desktop)"
                    value={photoOffsetTop}
                    onChange={(value?: number) =>
                        setPhotoOffsetTop(value ?? defaults.photoOffsetTop)
                    }
                    min={0}
                    max={160}
                    unit="px"
                />
                <PageBuilderPropertyHeader
                    label="Call to action"
                    tooltip="Leave the caption empty to hide the button"
                />
                <Form>
                    <FormField
                        label="Button text"
                        value={ctaCaption}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setCtaCaption(e.target.value)
                        }
                    />
                    <FormField
                        label="Button link"
                        placeholder="#"
                        value={ctaAction}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setCtaAction(e.target.value)
                        }
                    />
                </Form>
                <Select
                    title="Button style"
                    value={ctaStyle}
                    options={[
                        { label: "Saffron", value: "saffron" },
                        { label: "Saffron (large)", value: "saffron-big" },
                        { label: "White", value: "white" },
                    ]}
                    onChange={(value: CtaStyle) => setCtaStyle(value)}
                />
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Body copy" value="paragraphs">
                <div className="flex flex-col gap-3">
                    {paragraphs.map((paragraph, index) => (
                        <ParagraphEditor
                            key={index}
                            index={index}
                            total={paragraphs.length}
                            paragraph={paragraph}
                            onChange={(updated) =>
                                updateParagraph(index, updated)
                            }
                            onMove={moveParagraph}
                            onRemove={removeParagraph}
                        />
                    ))}
                    <div>
                        <Button component="button" onClick={addParagraph}>
                            Add paragraph
                        </Button>
                    </div>
                </div>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Design" value="design">
                <ColorSelector
                    title="Page ground"
                    value={groundColor}
                    onChange={(value?: string) =>
                        setGroundColor(value || defaults.groundColor)
                    }
                />
                <ColorSelector
                    title="Heading colour"
                    value={headingColor}
                    onChange={(value?: string) =>
                        setHeadingColor(value || defaults.headingColor)
                    }
                />
                <ColorSelector
                    title="Body colour"
                    value={bodyColor}
                    onChange={(value?: string) =>
                        setBodyColor(value || defaults.bodyColor)
                    }
                />
                <ColorSelector
                    title="Link colour"
                    tooltip="Anahata's saffron only scores 1.95:1 against the cream ground, under the 4.5:1 accessibility floor for body text. Choose the rust (#993300) for a readable link."
                    value={linkColor}
                    onChange={(value?: string) =>
                        setLinkColor(value || defaults.linkColor)
                    }
                />
                <ColorSelector
                    title="Link hover colour"
                    value={linkHoverColor}
                    onChange={(value?: string) =>
                        setLinkHoverColor(value || defaults.linkHoverColor)
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
