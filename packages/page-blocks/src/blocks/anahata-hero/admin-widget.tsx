import React, { useEffect, useState } from "react";
import type { Address, Profile } from "@courselit/common-models";
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
    PageBuilderPropertyHeader,
    PageBuilderSlider,
    SectionBackgroundPanel,
    Select,
    VerticalPaddingSelector,
} from "@courselit/components-library";
import Settings, {
    BannerFit,
    BannerHeightMode,
    BannerMode,
    BannerPosition,
    CtaStyle,
    HeroAnimation,
    HeroImage,
    HeroParagraph,
    PhotoPosition,
} from "./settings";
import * as defaults from "./defaults";
import { ImageSourceField } from "../../components/image-source-field";
import { normalizeImageSource } from "../../components/image-source";

interface AdminWidgetProps {
    name: string;
    settings: Settings;
    onChange: (...args: any[]) => void;
    address: Address;
    networkAction: boolean;
    profile: Profile;
    theme: Theme;
}

/** One line per offering; blank lines and stray spaces are dropped on save. */
const offeringsFromText = (text: string): string[] =>
    text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

/** A stored picture, or the default when it is absent or unreadable. */
const heroImage = (
    stored: HeroImage | undefined,
    fallback: HeroImage,
): HeroImage => {
    const source = normalizeImageSource(stored?.source);
    return source
        ? { source, alt: typeof stored?.alt === "string" ? stored.alt : "" }
        : fallback;
};

/**
 * Editor for one picture: the shared source control (URL · Library ·
 * Placeholder) plus this block's own alt text. A placeholder's description
 * is typed inside the source control; it doubles as the well's name until a
 * real image arrives, so the alt only matters for a URL or library image.
 */
function ImageEditor({
    label,
    tooltip,
    urlPlaceholder,
    value,
    onChange,
    profile,
    address,
}: {
    label: string;
    tooltip?: string;
    urlPlaceholder?: string;
    value: HeroImage;
    onChange: (image: HeroImage) => void;
    profile: Profile;
    address: Address;
}): JSX.Element {
    return (
        <div className="flex flex-col gap-2">
            <PageBuilderPropertyHeader label={label} tooltip={tooltip} />
            <ImageSourceField
                value={value.source}
                onChange={(source) => onChange({ ...value, source })}
                urlPlaceholder={urlPlaceholder}
                profile={profile}
                address={address}
            />
            {value.source.kind !== "placeholder" && (
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
            )}
        </div>
    );
}

/** Editor for one body paragraph plus its optional inline link. */
function ParagraphEditor({
    index,
    total,
    paragraph,
    isLede,
    onChange,
    onMove,
    onRemove,
}: {
    index: number;
    total: number;
    paragraph: HeroParagraph;
    isLede: boolean;
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
                <p className="font-semibold">
                    Paragraph {index + 1}
                    {isLede ? " (lede)" : ""}
                </p>
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
        heroImage(settings.bannerImage, defaults.bannerImage),
    );
    const [bannerFit, setBannerFit] = useState<BannerFit>(
        settings.bannerFit || defaults.bannerFit,
    );
    const [bannerPosition, setBannerPosition] = useState<BannerPosition>(
        settings.bannerPosition || defaults.bannerPosition,
    );
    const [bannerHeightMode, setBannerHeightMode] = useState<BannerHeightMode>(
        settings.bannerHeightMode || defaults.bannerHeightMode,
    );
    const [bannerModeKind, setBannerModeKind] = useState<BannerMode["kind"]>(
        settings.bannerMode?.kind || defaults.bannerMode.kind,
    );
    const [bannerAspectRatio, setBannerAspectRatio] = useState<string>(
        settings.bannerAspectRatio || defaults.bannerAspectRatio,
    );
    const [bannerMinHeight, setBannerMinHeight] = useState<number>(
        settings.bannerMinHeight ?? defaults.bannerMinHeight,
    );
    const [wordmark, setWordmark] = useState<HeroImage>(
        heroImage(settings.wordmark, defaults.wordmark),
    );
    const [wordmarkMaxWidth, setWordmarkMaxWidth] = useState<number>(
        settings.wordmarkMaxWidth ?? defaults.wordmarkMaxWidth,
    );
    const [animation, setAnimation] = useState<HeroAnimation>(
        settings.animation || defaults.animation,
    );

    /* ---- welcome row ---- */
    const [kicker, setKicker] = useState<string>(
        settings.kicker ?? defaults.kicker,
    );
    const [heading, setHeading] = useState<string>(
        settings.heading ?? defaults.heading,
    );
    const [offeringsText, setOfferingsText] = useState<string>(
        (settings.offerings ?? defaults.offerings).join("\n"),
    );
    const [paragraphs, setParagraphs] = useState<HeroParagraph[]>(
        settings.paragraphs || defaults.paragraphs,
    );
    const [ledeParagraphIndex, setLedeParagraphIndex] = useState<number>(
        settings.ledeParagraphIndex ?? defaults.ledeParagraphIndex,
    );
    const [photo, setPhoto] = useState<HeroImage>(
        heroImage(settings.photo, defaults.photo),
    );
    const [photoPosition, setPhotoPosition] = useState<PhotoPosition>(
        settings.photoPosition || defaults.photoPosition,
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
    const [secondaryCtaCaption, setSecondaryCtaCaption] = useState<string>(
        settings.secondaryCtaCaption ?? defaults.secondaryCtaCaption,
    );
    const [secondaryCtaAction, setSecondaryCtaAction] = useState<string>(
        settings.secondaryCtaAction ?? defaults.secondaryCtaAction,
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
            bannerHeightMode,
            bannerMode: { kind: bannerModeKind },
            bannerAspectRatio,
            bannerMinHeight,
            wordmark,
            wordmarkMaxWidth,
            animation,
            kicker,
            heading,
            offerings: offeringsFromText(offeringsText),
            paragraphs,
            ledeParagraphIndex,
            photo,
            photoPosition,
            photoOffsetTop,
            ctaCaption,
            ctaAction,
            ctaStyle,
            secondaryCtaCaption,
            secondaryCtaAction,
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
        bannerHeightMode,
        bannerModeKind,
        bannerAspectRatio,
        bannerMinHeight,
        wordmark,
        wordmarkMaxWidth,
        animation,
        kicker,
        heading,
        offeringsText,
        paragraphs,
        ledeParagraphIndex,
        photo,
        photoPosition,
        photoOffsetTop,
        ctaCaption,
        ctaAction,
        ctaStyle,
        secondaryCtaCaption,
        secondaryCtaAction,
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

    const ledeOptions = [
        { label: "None", value: "-1" },
        ...paragraphs.map((_, index) => ({
            label: `Paragraph ${index + 1}`,
            value: String(index),
        })),
    ];

    return (
        <AdminWidgetPanelContainer
            type="multiple"
            defaultValue={["banner", "welcome", "paragraphs"]}
        >
            <AdminWidgetPanel title="Banner" value="banner">
                <ImageEditor
                    label="Banner image"
                    tooltip="The full-width band behind the wordmark. A placeholder draws a waiting-for-asset well in the band's exact box."
                    urlPlaceholder="/anahata/hp-hero-bg.jpg"
                    value={bannerImage}
                    onChange={setBannerImage}
                    profile={profile}
                    address={address}
                />
                <ImageEditor
                    label="Wordmark overlay"
                    tooltip="Centred over the banner (835 × 120). Choose Placeholder to show a well; switch to URL and leave it blank to hide it."
                    urlPlaceholder="/anahata/solutions-for-life.png"
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
                <Select
                    title="Banner mode"
                    tooltip="Static shows the single banner photo below. Social rotation cycles through photos from your social feeds; manage those feeds under Dashboard → System → Settings → Social hero. The banner photo below always stays as the fallback."
                    value={bannerModeKind}
                    options={[
                        { label: "Static (single photo)", value: "static" },
                        {
                            label: "Social rotation (from your feeds)",
                            value: "social-rotation",
                        },
                    ]}
                    onChange={(value: BannerMode["kind"]) =>
                        setBannerModeKind(value)
                    }
                />
                {bannerModeKind === "social-rotation" ? (
                    <p className="text-sm text-muted-foreground">
                        Manage feed sources under Dashboard → System → Settings
                        → Social hero. This banner photo stays as frame 0 and
                        the fallback if a feed is unavailable.
                    </p>
                ) : null}
                <Select
                    title="Banner height"
                    tooltip="Full screen fills the viewport below the site header. Fixed sizes the band off the aspect ratio below."
                    value={bannerHeightMode}
                    options={[
                        {
                            label: "Full screen (fills the viewport)",
                            value: "full-screen",
                        },
                        {
                            label: "Fixed (aspect ratio + minimum height)",
                            value: "fixed",
                        },
                    ]}
                    onChange={(value: BannerHeightMode) =>
                        setBannerHeightMode(value)
                    }
                />
                <Form>
                    <FormField
                        label="Banner aspect ratio"
                        tooltip='Only used when Banner height is Fixed. A CSS aspect-ratio value, e.g. "1920 / 947"'
                        value={bannerAspectRatio}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setBannerAspectRatio(e.target.value)
                        }
                    />
                </Form>
                <PageBuilderSlider
                    title="Banner minimum height"
                    tooltip="Floor so the banner never collapses on narrow screens, in either Banner height mode"
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
                        label="Kicker"
                        tooltip="Small-caps line above the heading. Leave empty to hide it."
                        value={kicker}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setKicker(e.target.value)
                        }
                    />
                    <FormField
                        label="Heading"
                        value={heading}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setHeading(e.target.value)
                        }
                    />
                    <FormField
                        label="Offerings (one per line)"
                        tooltip="Typeset under the heading as a wrapping dotted line, e.g. Mentoring · Coaching · Teaching. Leave empty to hide the strip."
                        component="textarea"
                        rows={5}
                        value={offeringsText}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                            setOfferingsText(e.target.value)
                        }
                    />
                </Form>
                <ImageEditor
                    label="Photo"
                    tooltip="The 3:2 column beside the text. Shown when no banner is set; with a banner, the banner arrives in this column as you scroll."
                    urlPlaceholder="/anahata/hero-silentmed.jpg"
                    value={photo}
                    onChange={setPhoto}
                    profile={profile}
                    address={address}
                />
                <Select
                    title="Photo position"
                    tooltip="Which side of the text the photo column sits on from tablet width up. Phones stack text above photo."
                    value={photoPosition}
                    options={[
                        { label: "Right of the text", value: "right" },
                        { label: "Left of the text", value: "left" },
                    ]}
                    onChange={(value: PhotoPosition) => setPhotoPosition(value)}
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
                    label="Primary button"
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
                        placeholder="/p/members-library-test"
                        value={ctaAction}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setCtaAction(e.target.value)
                        }
                    />
                </Form>
                <Select
                    title="Button style"
                    tooltip="Pine is the primary recipe (pine fill, bone text); Moss the secondary (moss fill, ink text, pine edge). The three older names still render: Saffron and Saffron (large) paint the pine recipe, White the outline."
                    value={ctaStyle}
                    options={[
                        { label: "Pine (primary)", value: "pine" },
                        { label: "Moss (secondary)", value: "moss" },
                        { label: "Saffron → pine", value: "saffron" },
                        {
                            label: "Saffron (large) → pine, large",
                            value: "saffron-big",
                        },
                        { label: "White → outline", value: "white" },
                    ]}
                    onChange={(value: CtaStyle) => setCtaStyle(value)}
                />
                <PageBuilderPropertyHeader
                    label="Secondary button"
                    tooltip="Always the moss recipe. Leave the caption empty to hide it."
                />
                <Form>
                    <FormField
                        label="Button text"
                        value={secondaryCtaCaption}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setSecondaryCtaCaption(e.target.value)
                        }
                    />
                    <FormField
                        label="Button link"
                        placeholder="/p/private-sessions"
                        value={secondaryCtaAction}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setSecondaryCtaAction(e.target.value)
                        }
                    />
                </Form>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Body copy" value="paragraphs">
                <Select
                    title="Lede paragraph"
                    tooltip="Set one paragraph in the display face (Playfair Display, larger, heading colour)."
                    value={
                        ledeParagraphIndex >= 0 &&
                        ledeParagraphIndex < paragraphs.length
                            ? String(ledeParagraphIndex)
                            : "-1"
                    }
                    options={ledeOptions}
                    onChange={(value: string) =>
                        setLedeParagraphIndex(Number(value))
                    }
                />
                <div className="flex flex-col gap-3">
                    {paragraphs.map((paragraph, index) => (
                        <ParagraphEditor
                            key={index}
                            index={index}
                            total={paragraphs.length}
                            paragraph={paragraph}
                            isLede={index === ledeParagraphIndex}
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
                    tooltip="Also paints the offerings strip and the lede paragraph."
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
                    tooltip="Inline links in the body copy. Default is pine (8.22:1 on the bone ground); links are always underlined so colour never has to carry them alone."
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
