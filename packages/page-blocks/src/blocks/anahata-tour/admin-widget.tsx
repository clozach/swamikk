import React, { ChangeEvent, useEffect, useState } from "react";
import type { Address, Media, Profile } from "@courselit/common-models";
import type {
    Theme,
    ThemeStyle,
    SectionBackground,
} from "@courselit/page-models";
import {
    AdminWidgetPanel,
    AdminWidgetPanelContainer,
    Alert,
    AlertDescription,
    CssIdField,
    Form,
    FormField,
    MaxWidthSelector,
    MediaSelector,
    PageBuilderPropertyHeader,
    Select,
    SectionBackgroundPanel,
    Switch,
    Textarea,
    VerticalPaddingSelector,
} from "@courselit/components-library";
import { Lightbulb } from "lucide-react";
import Settings, {
    TourAspectRatio,
    TourCaptionPlacement,
    TourHeadingAlignment,
    TourLoadStrategy,
} from "./settings";
import {
    ASPECT_RATIO_OPTIONS,
    caption as defaultCaption,
    captionPlacement as defaultCaptionPlacement,
    desktopAspectRatio as defaultDesktopAspectRatio,
    heading as defaultHeading,
    headingAlignment as defaultHeadingAlignment,
    loadStrategy as defaultLoadStrategy,
    mobileAspectRatio as defaultMobileAspectRatio,
    posterButtonLabel as defaultPosterButtonLabel,
    posterHelpText as defaultPosterHelpText,
    showDivider as defaultShowDivider,
    tourTitle as defaultTourTitle,
    tourUrl as defaultTourUrl,
} from "./defaults";

interface AdminWidgetProps {
    name: string;
    settings: Settings;
    onChange: (...args: any[]) => void;
    address: Address;
    networkAction: boolean;
    profile: Profile;
    theme: Theme;
}

export default function AdminWidget({
    settings,
    onChange,
    address,
    profile,
    theme,
}: AdminWidgetProps): JSX.Element {
    const [heading, setHeading] = useState(settings.heading ?? defaultHeading);
    const [headingAlignment, setHeadingAlignment] =
        useState<TourHeadingAlignment>(
            settings.headingAlignment ?? defaultHeadingAlignment,
        );
    const [showDivider, setShowDivider] = useState<boolean>(
        settings.showDivider ?? defaultShowDivider,
    );
    const [caption, setCaption] = useState(settings.caption ?? defaultCaption);
    const [captionPlacement, setCaptionPlacement] =
        useState<TourCaptionPlacement>(
            settings.captionPlacement ?? defaultCaptionPlacement,
        );

    const [tourUrl, setTourUrl] = useState(settings.tourUrl ?? defaultTourUrl);
    const [tourTitle, setTourTitle] = useState(
        settings.tourTitle ?? defaultTourTitle,
    );

    const [desktopAspectRatio, setDesktopAspectRatio] =
        useState<TourAspectRatio>(
            settings.desktopAspectRatio ?? defaultDesktopAspectRatio,
        );
    const [mobileAspectRatio, setMobileAspectRatio] = useState<TourAspectRatio>(
        settings.mobileAspectRatio ?? defaultMobileAspectRatio,
    );

    const [loadStrategy, setLoadStrategy] = useState<TourLoadStrategy>(
        settings.loadStrategy ?? defaultLoadStrategy,
    );
    const [posterImage, setPosterImage] = useState<Partial<Media>>(
        settings.posterImage || {},
    );
    const [posterButtonLabel, setPosterButtonLabel] = useState(
        settings.posterButtonLabel ?? defaultPosterButtonLabel,
    );
    const [posterHelpText, setPosterHelpText] = useState(
        settings.posterHelpText ?? defaultPosterHelpText,
    );

    const [maxWidth, setMaxWidth] = useState<
        ThemeStyle["structure"]["page"]["width"]
    >(settings.maxWidth);
    const [verticalPadding, setVerticalPadding] = useState<
        ThemeStyle["structure"]["section"]["padding"]["y"]
    >(settings.verticalPadding || "py-12");
    const [background, setBackground] = useState<SectionBackground | undefined>(
        settings.background,
    );
    const [cssId, setCssId] = useState(settings.cssId);

    useEffect(() => {
        onChange({
            heading,
            headingAlignment,
            showDivider,
            caption,
            captionPlacement,
            tourUrl,
            tourTitle,
            desktopAspectRatio,
            mobileAspectRatio,
            loadStrategy,
            posterImage,
            posterButtonLabel,
            posterHelpText,
            maxWidth,
            verticalPadding,
            background,
            cssId,
        });
    }, [
        heading,
        headingAlignment,
        showDivider,
        caption,
        captionPlacement,
        tourUrl,
        tourTitle,
        desktopAspectRatio,
        mobileAspectRatio,
        loadStrategy,
        posterImage,
        posterButtonLabel,
        posterHelpText,
        maxWidth,
        verticalPadding,
        background,
        cssId,
    ]);

    return (
        <AdminWidgetPanelContainer
            type="multiple"
            defaultValue={["heading", "tour"]}
        >
            <AdminWidgetPanel title="Heading & copy" value="heading">
                <Form
                    className="flex flex-col gap-4"
                    onSubmit={(e) => e.preventDefault()}
                >
                    <FormField
                        label="Heading"
                        value={heading}
                        placeholder={defaultHeading}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setHeading(e.target.value)
                        }
                    />
                    <Select
                        title="Alignment"
                        subtitle="Aligns the divider, heading and copy together."
                        value={headingAlignment}
                        onChange={(value?: string) =>
                            setHeadingAlignment(value as TourHeadingAlignment)
                        }
                        options={[
                            { label: "Centered", value: "center" },
                            { label: "Left", value: "left" },
                        ]}
                    />
                </Form>
                <div className="flex items-center justify-between gap-4 py-2">
                    <PageBuilderPropertyHeader
                        label="Rust divider"
                        tooltip="The 200px rust rule above the heading, as on anahata-retreat.org.nz"
                    />
                    <Switch
                        checked={showDivider}
                        onChange={(value: boolean) => setShowDivider(value)}
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <PageBuilderPropertyHeader
                        label="Copy"
                        tooltip="The sentence explaining how to use the tour"
                    />
                    <Textarea
                        value={caption}
                        rows={4}
                        placeholder={defaultCaption}
                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                            setCaption(e.target.value)
                        }
                    />
                </div>
                <Form onSubmit={(e) => e.preventDefault()}>
                    <Select
                        title="Copy placement"
                        subtitle="The original site places it under the tour."
                        value={captionPlacement}
                        onChange={(value?: string) =>
                            setCaptionPlacement(value as TourCaptionPlacement)
                        }
                        options={[
                            { label: "Below the tour", value: "below" },
                            { label: "Above the tour", value: "above" },
                        ]}
                    />
                </Form>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Tour" value="tour">
                <Form
                    className="flex flex-col gap-4"
                    onSubmit={(e) => e.preventDefault()}
                >
                    <FormField
                        label="Tour URL"
                        type="url"
                        value={tourUrl}
                        placeholder={defaultTourUrl}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setTourUrl(e.target.value)
                        }
                    />
                    <FormField
                        label="Tour title"
                        value={tourTitle}
                        placeholder={defaultTourTitle}
                        tooltip="Read aloud by screen readers to describe the embedded tour"
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setTourTitle(e.target.value)
                        }
                    />
                    <Select
                        title="Shape on desktop"
                        value={desktopAspectRatio}
                        onChange={(value?: string) =>
                            setDesktopAspectRatio(value as TourAspectRatio)
                        }
                        options={ASPECT_RATIO_OPTIONS}
                    />
                    <Select
                        title="Shape on mobile"
                        subtitle="Applies below 768px. A taller shape keeps the tour usable on a phone."
                        value={mobileAspectRatio}
                        onChange={(value?: string) =>
                            setMobileAspectRatio(value as TourAspectRatio)
                        }
                        options={ASPECT_RATIO_OPTIONS}
                    />
                </Form>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Loading" value="loading">
                <Form onSubmit={(e) => e.preventDefault()}>
                    <Select
                        title="When to load the tour"
                        value={loadStrategy}
                        onChange={(value?: string) =>
                            setLoadStrategy(value as TourLoadStrategy)
                        }
                        options={[
                            {
                                label: "Straight away",
                                value: "eager",
                                sublabel: "The tour is there on arrival",
                            },
                            {
                                label: "When the visitor asks",
                                value: "click",
                                sublabel: "Show a poster with a button first",
                            },
                        ]}
                    />
                </Form>
                {loadStrategy === "click" && (
                    <>
                        <Alert className="text-xs my-2">
                            <Lightbulb className="w-4 h-4" />
                            <AlertDescription>
                                The tour is only fetched once someone presses
                                the button, so a casual visit stays light.
                            </AlertDescription>
                        </Alert>
                        <PageBuilderPropertyHeader
                            label="Poster image"
                            tooltip="Optional still shown behind the button. Leave empty for a plain cream panel."
                        />
                        <MediaSelector
                            title=""
                            src={posterImage?.thumbnail}
                            srcTitle={posterImage?.originalFileName}
                            profile={profile}
                            address={address}
                            onSelection={(media: Media) =>
                                media && setPosterImage(media)
                            }
                            onRemove={() => setPosterImage({})}
                            strings={{}}
                            access="public"
                            mediaId={posterImage?.mediaId}
                            type="page"
                        />
                        <Form
                            className="flex flex-col gap-4 mt-2"
                            onSubmit={(e) => e.preventDefault()}
                        >
                            <FormField
                                label="Button label"
                                value={posterButtonLabel}
                                placeholder={defaultPosterButtonLabel}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setPosterButtonLabel(e.target.value)
                                }
                            />
                        </Form>
                        <div className="flex flex-col gap-2 mt-2">
                            <PageBuilderPropertyHeader
                                label="Poster text"
                                tooltip="Shown above the button. Leave empty to show only the button."
                            />
                            <Textarea
                                value={posterHelpText}
                                rows={3}
                                placeholder={defaultPosterHelpText}
                                onChange={(
                                    e: ChangeEvent<HTMLTextAreaElement>,
                                ) => setPosterHelpText(e.target.value)}
                            />
                        </div>
                    </>
                )}
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Design" value="design">
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
