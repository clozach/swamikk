import React, { useEffect, useState } from "react";
import type { Address, Profile } from "@courselit/common-models";
import type {
    Theme,
    ThemeStyle,
    SectionBackground,
} from "@courselit/page-models";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
    AdminWidgetPanel,
    AdminWidgetPanelContainer,
    Button,
    Checkbox,
    CssIdField,
    Form,
    FormField,
    MaxWidthSelector,
    PageBuilderPropertyHeader,
    SectionBackgroundPanel,
    Select,
    VerticalPaddingSelector,
} from "@courselit/components-library";
import { generateUniqueId } from "@courselit/utils";
import type { ImageSource } from "../../components/image-source";
import { ImageSourceField } from "../../components/image-source-field";
import Settings, {
    GatheringEvent,
    GatheringsLayout,
    HeadingLink,
    MoreLink,
} from "./settings";
import {
    blankEvent,
    headingLink as defaultHeadingLink,
    intro as defaultIntro,
    showDivider as defaultShowDivider,
    title as defaultTitle,
} from "./defaults";
import {
    normalizeEvents,
    normalizeLayout,
    normalizeMoreLink,
} from "./normalize";

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
 * The layout Select needs a string for "no explicit choice"; `auto` is that
 * sentinel and maps back to an absent setting.
 */
type LayoutChoice = GatheringsLayout | "auto";

const LAYOUT_OPTIONS: { label: string; value: LayoutChoice }[] = [
    { label: "Automatic (row for one event, grid for more)", value: "auto" },
    { label: "Row — one wide card, picture left", value: "row" },
    { label: "Grid — up to four across", value: "grid" },
];

/**
 * Stored documents predate this union (or were hand-edited), so a value may be
 * missing `kind`, or claim `linked` with no `href`. Parse into the safe shape
 * before the editor renders it.
 */
function normalizeHeadingLink(value: unknown): HeadingLink {
    if (value && typeof value === "object" && "kind" in value) {
        const candidate = value as HeadingLink;
        if (candidate.kind === "plain") {
            return { kind: "plain" };
        }
        if (candidate.kind === "linked") {
            return {
                kind: "linked",
                href: typeof candidate.href === "string" ? candidate.href : "",
            };
        }
    }
    return defaultHeadingLink;
}

export default function AdminWidget({
    settings,
    onChange,
    profile,
    address,
    theme,
}: AdminWidgetProps): JSX.Element {
    const [title, setTitle] = useState(settings.title ?? defaultTitle);
    const [intro, setIntro] = useState(settings.intro ?? defaultIntro);
    const [headingLink, setHeadingLink] = useState<HeadingLink>(
        normalizeHeadingLink(settings.headingLink),
    );
    const [showDivider, setShowDivider] = useState<boolean>(
        settings.showDivider ?? defaultShowDivider,
    );
    const [events, setEvents] = useState<GatheringEvent[]>(() =>
        normalizeEvents(settings.events, generateUniqueId),
    );
    const [layout, setLayout] = useState<GatheringsLayout | undefined>(
        normalizeLayout(settings.layout),
    );
    const [moreLink, setMoreLink] = useState<MoreLink>(
        normalizeMoreLink(settings.moreLink),
    );
    const [cssId, setCssId] = useState(settings.cssId);
    const [maxWidth, setMaxWidth] = useState<
        ThemeStyle["structure"]["page"]["width"]
    >(settings.maxWidth);
    const [verticalPadding, setVerticalPadding] = useState<
        ThemeStyle["structure"]["section"]["padding"]["y"]
    >(settings.verticalPadding);
    const [background, setBackground] = useState<SectionBackground>(
        settings.background,
    );

    useEffect(() => {
        onChange({
            title,
            intro,
            headingLink,
            showDivider,
            events,
            layout,
            moreLink,
            cssId,
            maxWidth,
            verticalPadding,
            background,
        });
    }, [
        title,
        intro,
        headingLink,
        showDivider,
        events,
        layout,
        moreLink,
        cssId,
        maxWidth,
        verticalPadding,
        background,
    ]);

    const updateEvent = (index: number, patch: Partial<GatheringEvent>) => {
        setEvents((current) =>
            current.map((event, i) =>
                i === index ? { ...event, ...patch } : event,
            ),
        );
    };

    const addEvent = () => {
        setEvents((current) => [
            ...current,
            { ...blankEvent, id: generateUniqueId() },
        ]);
    };

    const removeEvent = (index: number) => {
        setEvents((current) => current.filter((_, i) => i !== index));
    };

    const moveEvent = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        setEvents((current) => {
            if (target < 0 || target >= current.length) {
                return current;
            }
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    return (
        <AdminWidgetPanelContainer
            type="multiple"
            defaultValue={["heading", "events", "design"]}
        >
            <AdminWidgetPanel title="Heading" value="heading">
                <Form>
                    <FormField
                        label="Section heading"
                        value={title ?? ""}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setTitle(e.target.value)
                        }
                        tooltip="The pine heading above the event cards."
                    />
                    <FormField
                        label="Intro"
                        component="textarea"
                        rows={3}
                        value={intro ?? ""}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                            setIntro(e.target.value)
                        }
                        tooltip="One short paragraph under the heading. Leave blank to hide it."
                    />
                </Form>
                <Select
                    title="Heading behaviour"
                    value={headingLink.kind}
                    options={[
                        { label: "Plain text", value: "plain" },
                        { label: "Links somewhere", value: "linked" },
                    ]}
                    onChange={(kind: HeadingLink["kind"]) =>
                        setHeadingLink(
                            kind === "linked"
                                ? {
                                      kind: "linked",
                                      href:
                                          headingLink.kind === "linked"
                                              ? headingLink.href
                                              : "",
                                  }
                                : { kind: "plain" },
                        )
                    }
                />
                {headingLink.kind === "linked" && (
                    <Form>
                        <FormField
                            label="Heading link"
                            value={headingLink.href ?? ""}
                            onChange={(
                                e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                                setHeadingLink({
                                    kind: "linked",
                                    href: e.target.value,
                                })
                            }
                            placeholder="/products"
                            tooltip="Where the heading navigates. Use a site-relative path like /products."
                        />
                    </Form>
                )}
                <div className="flex justify-between items-center gap-2">
                    <PageBuilderPropertyHeader
                        label="Show divider"
                        tooltip="A short pine rule beneath the heading."
                    />
                    <Checkbox
                        checked={showDivider}
                        onChange={(value: boolean) => setShowDivider(value)}
                    />
                </div>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Events" value="events">
                <Select
                    title="Layout"
                    value={layout ?? "auto"}
                    options={LAYOUT_OPTIONS}
                    onChange={(choice: LayoutChoice) =>
                        setLayout(choice === "auto" ? undefined : choice)
                    }
                />
                <PageBuilderPropertyHeader
                    label="Event cards"
                    tooltip="Row: one wide card with the picture on the left. Grid: four across on desktop, two on tablet, one on mobile."
                />
                {events.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        No events yet. Add one below.
                    </p>
                )}
                <Accordion type="multiple" className="w-full">
                    {events.map((event, index) => (
                        <AccordionItem
                            key={event.id}
                            value={event.id}
                            className="w-full"
                        >
                            <AccordionTrigger className="text-left">
                                <span className="truncate">
                                    {event.title || `Event ${index + 1}`}
                                </span>
                            </AccordionTrigger>
                            <AccordionContent>
                                <div className="flex flex-col gap-2">
                                    <Form>
                                        <FormField
                                            label="Title"
                                            value={event.title ?? ""}
                                            onChange={(
                                                e: React.ChangeEvent<HTMLInputElement>,
                                            ) =>
                                                updateEvent(index, {
                                                    title: e.target.value,
                                                })
                                            }
                                        />
                                        <FormField
                                            label="Link"
                                            value={event.href ?? ""}
                                            onChange={(
                                                e: React.ChangeEvent<HTMLInputElement>,
                                            ) =>
                                                updateEvent(index, {
                                                    href: e.target.value,
                                                })
                                            }
                                            placeholder="https://www.anahata-retreat.org.nz/event/…"
                                            tooltip="Where the title navigates. Leave as # until the event page exists."
                                        />
                                    </Form>
                                    <ImageSourceField
                                        label="Image"
                                        tooltip="The 16:9 picture on the card. Choose Placeholder to show a waiting-for-asset well until the poster arrives."
                                        value={event.image}
                                        onChange={(image: ImageSource) =>
                                            updateEvent(index, { image })
                                        }
                                        urlPlaceholder="/anahata/event-european-tour.png"
                                        profile={profile}
                                        address={address}
                                    />
                                    <Form>
                                        <FormField
                                            label="Image alt text"
                                            value={event.imageAlt ?? ""}
                                            onChange={(
                                                e: React.ChangeEvent<HTMLInputElement>,
                                            ) =>
                                                updateEvent(index, {
                                                    imageAlt: e.target.value,
                                                })
                                            }
                                            tooltip="Describes the image for screen readers. Leave blank if purely decorative."
                                        />
                                        <FormField
                                            label="Host line"
                                            value={event.hostLine ?? ""}
                                            onChange={(
                                                e: React.ChangeEvent<HTMLInputElement>,
                                            ) =>
                                                updateEvent(index, {
                                                    hostLine: e.target.value,
                                                })
                                            }
                                            placeholder="Hosted by: Anahata Yoga Retreat"
                                        />
                                        <FormField
                                            label="Date range"
                                            value={event.dateRange ?? ""}
                                            onChange={(
                                                e: React.ChangeEvent<HTMLInputElement>,
                                            ) =>
                                                updateEvent(index, {
                                                    dateRange: e.target.value,
                                                })
                                            }
                                            placeholder="Saturday 01 August, 2026 @ 12:00 am – Saturday 31 October, 2026 @ 11:59 pm"
                                        />
                                        <FormField
                                            label="Excerpt"
                                            component="textarea"
                                            rows={3}
                                            value={event.excerpt ?? ""}
                                            onChange={(
                                                e: React.ChangeEvent<HTMLTextAreaElement>,
                                            ) =>
                                                updateEvent(index, {
                                                    excerpt: e.target.value,
                                                })
                                            }
                                        />
                                    </Form>
                                    <div className="flex flex-wrap gap-2 pt-2">
                                        <Button
                                            component="button"
                                            variant="soft"
                                            onClick={() => moveEvent(index, -1)}
                                            disabled={index === 0}
                                        >
                                            Move up
                                        </Button>
                                        <Button
                                            component="button"
                                            variant="soft"
                                            onClick={() => moveEvent(index, 1)}
                                            disabled={
                                                index === events.length - 1
                                            }
                                        >
                                            Move down
                                        </Button>
                                        <Button
                                            component="button"
                                            variant="soft"
                                            onClick={() => removeEvent(index)}
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
                <div className="pt-2">
                    <Button component="button" onClick={addEvent}>
                        Add event
                    </Button>
                </div>
                <PageBuilderPropertyHeader
                    label="Link under the cards"
                    tooltip="Blank either field to hide the link. A full https:// address opens in a new tab and gets the ↗ mark automatically."
                />
                <Form>
                    <FormField
                        label="Label"
                        value={moreLink.label}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setMoreLink({ ...moreLink, label: e.target.value })
                        }
                        placeholder="All Anahata events"
                    />
                    <FormField
                        label="Link"
                        value={moreLink.href}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setMoreLink({ ...moreLink, href: e.target.value })
                        }
                        placeholder="https://www.anahata-retreat.org.nz/gatherings"
                    />
                </Form>
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
