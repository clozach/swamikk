import React, { useEffect, useState } from "react";
import type { Address, Profile } from "@courselit/common-models";
import type { Theme } from "@courselit/page-models";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
    AdminWidgetPanel,
    AdminWidgetPanelContainer,
    Button,
    Checkbox,
    ColorSelector,
    CssIdField,
    DragAndDrop,
    Form,
    FormField,
    IconButton,
    PageBuilderPropertyHeader,
    PageBuilderSlider,
    Select,
} from "@courselit/components-library";
import { Delete, Edit } from "@courselit/icons";
import { generateUniqueId } from "@courselit/utils";
import Settings, {
    BackToTop,
    ContactColumn,
    FooterColumn,
    FooterLink,
    LinksColumn,
    SocialLink,
    SocialPlatform,
} from "./settings";
import {
    INNER_MAX_WIDTH,
    NAVY,
    OCEAN,
    OCEAN_HAIRLINE,
    PADDING_BOTTOM,
    PADDING_TOP,
    WHITE,
    backToTop as defaultBackToTop,
    columns as defaultColumns,
    copyrightLinkHref as defaultCopyrightLinkHref,
    copyrightLinkLabel as defaultCopyrightLinkLabel,
    copyrightLinkPrefix as defaultCopyrightLinkPrefix,
    copyrightOwner as defaultCopyrightOwner,
    copyrightPrefix as defaultCopyrightPrefix,
    decorLeftUrl as defaultDecorLeftUrl,
    decorRightUrl as defaultDecorRightUrl,
} from "./defaults";

const MAX_COLUMNS = 4;

const socialOptions: { label: string; value: SocialPlatform }[] = [
    { label: "Facebook", value: "facebook" },
    { label: "Instagram", value: "instagram" },
    { label: "YouTube", value: "youtube" },
    { label: "Vimeo", value: "vimeo" },
];

export interface AdminWidgetProps {
    name: string;
    settings: Settings;
    onChange: (...args: any[]) => void;
    address: Address;
    networkAction: boolean;
    profile: Profile;
    theme: Theme;
}

/**
 * Row renderer for the drag-and-drop link list. Receives its props from
 * DragAndDrop's `items` entries.
 */
function LinkEditor({
    link,
    columnIndex,
    index,
    onLinkChange,
    onLinkDelete,
}: {
    link: FooterLink;
    columnIndex: number;
    index: number;
    onLinkChange: (
        columnIndex: number,
        index: number,
        link: FooterLink,
    ) => void;
    onLinkDelete: (columnIndex: number, index: number) => void;
}): JSX.Element {
    const [label, setLabel] = useState(link.label);
    const [href, setHref] = useState(link.href);
    const [editing, setEditing] = useState(false);

    const save = () => {
        onLinkChange(columnIndex, index, { id: link.id, label, href });
        setEditing(false);
    };

    if (!editing) {
        return (
            <div className="flex w-full items-center justify-between gap-2">
                <span className="truncate">
                    {label || "[empty]"}
                    <span className="ml-2 text-xs text-muted-foreground">
                        {href}
                    </span>
                </span>
                <IconButton variant="soft" onClick={() => setEditing(true)}>
                    <Edit />
                </IconButton>
            </div>
        );
    }

    return (
        <Form className="mb-4 flex w-full flex-col gap-2">
            <FormField
                label="Label"
                value={label}
                onChange={(e: any) => setLabel(e.target.value)}
            />
            <FormField
                label="URL"
                value={href}
                tooltip="Use /blog for the blog, or # for a page that does not exist yet."
                onChange={(e: any) => setHref(e.target.value)}
            />
            <div className="flex justify-end gap-2">
                <Button component="button" onClick={save}>
                    Save
                </Button>
                <Button
                    component="button"
                    variant="soft"
                    onClick={() => onLinkDelete(columnIndex, index)}
                >
                    Delete
                </Button>
            </div>
        </Form>
    );
}

export default function AdminWidget({
    settings,
    onChange,
}: AdminWidgetProps): JSX.Element {
    // `?? defaultColumns`, not a length check: an empty array is a deliberate
    // "no columns" state, and treating it as absent would silently resurrect
    // the Anahata defaults the next time the panel mounted.
    const [columns, setColumns] = useState<FooterColumn[]>(
        settings.columns ?? defaultColumns,
    );

    const [groundColor, setGroundColor] = useState(
        settings.groundColor || OCEAN,
    );
    const [textColor, setTextColor] = useState(settings.textColor || WHITE);
    const [hairlineColor, setHairlineColor] = useState(
        settings.hairlineColor || OCEAN_HAIRLINE,
    );

    const [decorLeftUrl, setDecorLeftUrl] = useState(
        settings.decorLeftUrl ?? defaultDecorLeftUrl,
    );
    const [decorRightUrl, setDecorRightUrl] = useState(
        settings.decorRightUrl ?? defaultDecorRightUrl,
    );

    const [innerMaxWidth, setInnerMaxWidth] = useState(
        settings.innerMaxWidth || INNER_MAX_WIDTH,
    );
    const [paddingTop, setPaddingTop] = useState(
        settings.paddingTop ?? PADDING_TOP,
    );
    const [paddingBottom, setPaddingBottom] = useState(
        settings.paddingBottom ?? PADDING_BOTTOM,
    );

    const [copyrightGroundColor, setCopyrightGroundColor] = useState(
        settings.copyrightGroundColor || NAVY,
    );
    const [copyrightPrefix, setCopyrightPrefix] = useState(
        settings.copyrightPrefix ?? defaultCopyrightPrefix,
    );
    const [copyrightOwner, setCopyrightOwner] = useState(
        settings.copyrightOwner ?? defaultCopyrightOwner,
    );
    const [copyrightLinkPrefix, setCopyrightLinkPrefix] = useState(
        settings.copyrightLinkPrefix ?? defaultCopyrightLinkPrefix,
    );
    const [copyrightLinkLabel, setCopyrightLinkLabel] = useState(
        settings.copyrightLinkLabel ?? defaultCopyrightLinkLabel,
    );
    const [copyrightLinkHref, setCopyrightLinkHref] = useState(
        settings.copyrightLinkHref ?? defaultCopyrightLinkHref,
    );

    const storedBackToTop: BackToTop = settings.backToTop || defaultBackToTop;
    const [backToTopEnabled, setBackToTopEnabled] = useState(
        storedBackToTop.enabled,
    );
    // Held outside the union so toggling the control off and on again
    // does not lose the editor's copy.
    const [backToTopLabel, setBackToTopLabel] = useState(
        storedBackToTop.enabled
            ? storedBackToTop.label
            : (defaultBackToTop as Extract<BackToTop, { enabled: true }>).label,
    );
    const [backToTopReveal, setBackToTopReveal] = useState(
        storedBackToTop.enabled
            ? storedBackToTop.revealAfter
            : (defaultBackToTop as Extract<BackToTop, { enabled: true }>)
                  .revealAfter,
    );

    const [cssId, setCssId] = useState(settings.cssId);

    useEffect(() => {
        const backToTop: BackToTop = backToTopEnabled
            ? {
                  enabled: true,
                  label: backToTopLabel,
                  revealAfter: backToTopReveal,
              }
            : { enabled: false };

        onChange({
            columns,
            groundColor,
            textColor,
            hairlineColor,
            decorLeftUrl,
            decorRightUrl,
            innerMaxWidth,
            paddingTop,
            paddingBottom,
            copyrightGroundColor,
            copyrightPrefix,
            copyrightOwner,
            copyrightLinkPrefix,
            copyrightLinkLabel,
            copyrightLinkHref,
            backToTop,
            cssId,
        });
    }, [
        columns,
        groundColor,
        textColor,
        hairlineColor,
        decorLeftUrl,
        decorRightUrl,
        innerMaxWidth,
        paddingTop,
        paddingBottom,
        copyrightGroundColor,
        copyrightPrefix,
        copyrightOwner,
        copyrightLinkPrefix,
        copyrightLinkLabel,
        copyrightLinkHref,
        backToTopEnabled,
        backToTopLabel,
        backToTopReveal,
        cssId,
    ]);

    /* ---------------- column helpers ---------------- */

    const replaceColumn = (index: number, column: FooterColumn) => {
        const next = [...columns];
        next[index] = column;
        setColumns(next);
    };

    const addLinksColumn = () => {
        if (columns.length >= MAX_COLUMNS) return;
        const column: LinksColumn = {
            kind: "links",
            id: generateUniqueId(),
            title: `Column ${columns.length + 1}`,
            links: [{ id: generateUniqueId(), label: "Link", href: "#" }],
        };
        setColumns([...columns, column]);
    };

    const deleteColumn = (index: number) => {
        setColumns(columns.filter((_, i) => i !== index));
    };

    const onLinkChange = (
        columnIndex: number,
        linkIndex: number,
        link: FooterLink,
    ) => {
        const column = columns[columnIndex];
        if (column.kind !== "links") return;
        const links = [...column.links];
        links[linkIndex] = link;
        replaceColumn(columnIndex, { ...column, links });
    };

    const onLinkDelete = (columnIndex: number, linkIndex: number) => {
        const column = columns[columnIndex];
        if (column.kind !== "links") return;
        replaceColumn(columnIndex, {
            ...column,
            links: column.links.filter((_, i) => i !== linkIndex),
        });
    };

    const addLink = (columnIndex: number) => {
        const column = columns[columnIndex];
        if (column.kind !== "links") return;
        replaceColumn(columnIndex, {
            ...column,
            links: [
                ...column.links,
                { id: generateUniqueId(), label: "Link", href: "#" },
            ],
        });
    };

    const updateSocial = (
        columnIndex: number,
        socialIndex: number,
        patch: Partial<SocialLink>,
    ) => {
        const column = columns[columnIndex];
        if (column.kind !== "contact") return;
        const socials = [...column.socials];
        socials[socialIndex] = { ...socials[socialIndex], ...patch };
        replaceColumn(columnIndex, { ...column, socials });
    };

    const addSocial = (columnIndex: number) => {
        const column = columns[columnIndex];
        if (column.kind !== "contact") return;
        replaceColumn(columnIndex, {
            ...column,
            socials: [
                ...column.socials,
                { id: generateUniqueId(), platform: "facebook", href: "#" },
            ],
        });
    };

    const deleteSocial = (columnIndex: number, socialIndex: number) => {
        const column = columns[columnIndex];
        if (column.kind !== "contact") return;
        replaceColumn(columnIndex, {
            ...column,
            socials: column.socials.filter((_, i) => i !== socialIndex),
        });
    };

    /* ---------------- column editors ---------------- */

    const renderLinksColumn = (column: LinksColumn, columnIndex: number) => {
        // Settings arrive as plain JSON, so a hand-edited or partially
        // migrated column can be missing its list entirely.
        const links = column.links ?? [];

        return (
            <AccordionContent className="flex flex-col gap-4">
                <Form>
                    <FormField
                        label="Column title"
                        value={column.title}
                        tooltip="Playfair Display, uppercase. Leave empty to hide the title."
                        onChange={(e: any) =>
                            replaceColumn(columnIndex, {
                                ...column,
                                title: e.target.value,
                            })
                        }
                    />
                </Form>
                <PageBuilderPropertyHeader
                    label="Links"
                    tooltip="Drag to reorder. Use /blog for the blog; # for pages that do not exist yet."
                />
                <DragAndDrop
                    // DragAndDrop seeds its internal order from `items` once and
                    // never resyncs, so the key has to change on ANY link edit —
                    // keyed on length alone, editing a label and then dragging
                    // would write the pre-edit labels back over the change.
                    key={`${column.id}-${JSON.stringify(links)}`}
                    items={links.map((link, index) => ({
                        id: link.id,
                        link,
                        index,
                        columnIndex,
                        onLinkChange,
                        onLinkDelete,
                    }))}
                    Renderer={LinkEditor}
                    onChange={(items: any[]) => {
                        const reordered = items.map((item) => item.link);
                        if (
                            JSON.stringify(reordered) !== JSON.stringify(links)
                        ) {
                            replaceColumn(columnIndex, {
                                ...column,
                                links: reordered,
                            });
                        }
                    }}
                />
                <div className="flex justify-between">
                    <Button
                        component="button"
                        variant="soft"
                        onClick={() => deleteColumn(columnIndex)}
                    >
                        Delete column
                    </Button>
                    <Button
                        component="button"
                        onClick={() => addLink(columnIndex)}
                    >
                        Add link
                    </Button>
                </div>
            </AccordionContent>
        );
    };

    const renderContactColumn = (
        column: ContactColumn,
        columnIndex: number,
    ) => {
        const addressLines = column.addressLines ?? [];
        const socials = column.socials ?? [];

        return (
            <AccordionContent className="flex flex-col gap-4">
                <Form className="flex flex-col gap-2">
                    <FormField
                        label="Column title"
                        value={column.title}
                        tooltip="Usually empty — this column leads with the logo."
                        onChange={(e: any) =>
                            replaceColumn(columnIndex, {
                                ...column,
                                title: e.target.value,
                            })
                        }
                    />
                    <FormField
                        label="Logo URL"
                        value={column.logoUrl}
                        onChange={(e: any) =>
                            replaceColumn(columnIndex, {
                                ...column,
                                logoUrl: e.target.value,
                            })
                        }
                    />
                    <FormField
                        label="Logo alt text"
                        value={column.logoAlt}
                        onChange={(e: any) =>
                            replaceColumn(columnIndex, {
                                ...column,
                                logoAlt: e.target.value,
                            })
                        }
                    />
                    <FormField
                        label="Logo width (px)"
                        type="number"
                        value={column.logoWidth}
                        onChange={(e: any) =>
                            replaceColumn(columnIndex, {
                                ...column,
                                logoWidth: parseInt(e.target.value, 10) || 0,
                            })
                        }
                    />
                    <FormField
                        label="Logo height (px)"
                        type="number"
                        value={column.logoHeight}
                        onChange={(e: any) =>
                            replaceColumn(columnIndex, {
                                ...column,
                                logoHeight: parseInt(e.target.value, 10) || 0,
                            })
                        }
                    />
                    <FormField
                        label="Heading"
                        value={column.heading}
                        onChange={(e: any) =>
                            replaceColumn(columnIndex, {
                                ...column,
                                heading: e.target.value,
                            })
                        }
                    />
                    <FormField
                        label="Address"
                        component="textarea"
                        rows={3}
                        value={addressLines.join("\n")}
                        tooltip="One line per row."
                        onChange={(e: any) =>
                            replaceColumn(columnIndex, {
                                ...column,
                                addressLines: e.target.value.split("\n"),
                            })
                        }
                    />
                    <FormField
                        label="Email label"
                        value={column.emailLabel}
                        onChange={(e: any) =>
                            replaceColumn(columnIndex, {
                                ...column,
                                emailLabel: e.target.value,
                            })
                        }
                    />
                    <FormField
                        label="Email address"
                        value={column.email}
                        onChange={(e: any) =>
                            replaceColumn(columnIndex, {
                                ...column,
                                email: e.target.value,
                            })
                        }
                    />
                </Form>
                <PageBuilderPropertyHeader
                    label="Socials"
                    tooltip="Rendered as 32px ringed circles beneath the address."
                />
                {socials.map((social, socialIndex) => (
                    <div
                        key={social.id}
                        className="flex flex-col gap-2 rounded border border-border p-2"
                    >
                        <Select
                            title="Platform"
                            value={social.platform}
                            options={socialOptions}
                            onChange={(value: SocialPlatform) =>
                                updateSocial(columnIndex, socialIndex, {
                                    platform: value,
                                })
                            }
                        />
                        <Form>
                            <FormField
                                label="URL"
                                value={social.href}
                                onChange={(e: any) =>
                                    updateSocial(columnIndex, socialIndex, {
                                        href: e.target.value,
                                    })
                                }
                            />
                        </Form>
                        <div className="flex justify-end">
                            <IconButton
                                variant="soft"
                                onClick={() =>
                                    deleteSocial(columnIndex, socialIndex)
                                }
                            >
                                <Delete />
                            </IconButton>
                        </div>
                    </div>
                ))}
                <div className="flex justify-between">
                    <Button
                        component="button"
                        variant="soft"
                        onClick={() => deleteColumn(columnIndex)}
                    >
                        Delete column
                    </Button>
                    <Button
                        component="button"
                        onClick={() => addSocial(columnIndex)}
                    >
                        Add social
                    </Button>
                </div>
            </AccordionContent>
        );
    };

    const columnLabel = (column: FooterColumn): string => {
        if (column.title) return column.title;
        return column.kind === "contact"
            ? column.heading || "Contact"
            : "[empty]";
    };

    return (
        <AdminWidgetPanelContainer
            type="multiple"
            defaultValue={["columns", "copyright"]}
        >
            <AdminWidgetPanel title="Columns" value="columns">
                <Accordion type="single" collapsible className="w-full">
                    {columns.map((column, columnIndex) => (
                        <AccordionItem key={column.id} value={column.id}>
                            <AccordionTrigger>
                                {columnLabel(column)}
                            </AccordionTrigger>
                            {column.kind === "links"
                                ? renderLinksColumn(column, columnIndex)
                                : renderContactColumn(column, columnIndex)}
                        </AccordionItem>
                    ))}
                </Accordion>
                <div className="mt-4 flex justify-end">
                    <Button
                        component="button"
                        onClick={addLinksColumn}
                        disabled={columns.length >= MAX_COLUMNS}
                    >
                        Add link column
                    </Button>
                </div>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Copyright strip" value="copyright">
                <Form className="flex flex-col gap-2">
                    <FormField
                        label="Prefix"
                        value={copyrightPrefix}
                        onChange={(e: any) =>
                            setCopyrightPrefix(e.target.value)
                        }
                    />
                    <FormField
                        label="Owner"
                        value={copyrightOwner}
                        tooltip="Rendered bold."
                        onChange={(e: any) => setCopyrightOwner(e.target.value)}
                    />
                    <FormField
                        label="Credit prefix"
                        value={copyrightLinkPrefix}
                        onChange={(e: any) =>
                            setCopyrightLinkPrefix(e.target.value)
                        }
                    />
                    <FormField
                        label="Credit name"
                        value={copyrightLinkLabel}
                        tooltip="Rendered bold. Leave empty to hide the credit."
                        onChange={(e: any) =>
                            setCopyrightLinkLabel(e.target.value)
                        }
                    />
                    <FormField
                        label="Credit URL"
                        value={copyrightLinkHref}
                        onChange={(e: any) =>
                            setCopyrightLinkHref(e.target.value)
                        }
                    />
                </Form>
                <ColorSelector
                    title="Strip background"
                    value={copyrightGroundColor}
                    onChange={(value?: string) =>
                        setCopyrightGroundColor(value || NAVY)
                    }
                />
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Decorative edges" value="decor">
                <Form className="flex flex-col gap-2">
                    <FormField
                        label="Left image URL"
                        value={decorLeftUrl}
                        tooltip="Leave empty to hide the left ornament."
                        onChange={(e: any) => setDecorLeftUrl(e.target.value)}
                    />
                    <FormField
                        label="Right image URL"
                        value={decorRightUrl}
                        tooltip="Leave empty to hide the right ornament."
                        onChange={(e: any) => setDecorRightUrl(e.target.value)}
                    />
                </Form>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Design" value="design">
                <ColorSelector
                    title="Footer background"
                    value={groundColor}
                    onChange={(value?: string) =>
                        setGroundColor(value || OCEAN)
                    }
                />
                <ColorSelector
                    title="Text"
                    value={textColor}
                    onChange={(value?: string) => setTextColor(value || WHITE)}
                />
                <ColorSelector
                    title="Menu hairline"
                    value={hairlineColor}
                    onChange={(value?: string) =>
                        setHairlineColor(value || OCEAN_HAIRLINE)
                    }
                />
                <PageBuilderSlider
                    title="Content width"
                    min={600}
                    max={1400}
                    value={innerMaxWidth}
                    unit="px"
                    onChange={(value?: number) =>
                        setInnerMaxWidth(value ?? INNER_MAX_WIDTH)
                    }
                />
                <PageBuilderSlider
                    title="Top padding"
                    min={0}
                    max={120}
                    value={paddingTop}
                    unit="px"
                    onChange={(value?: number) =>
                        setPaddingTop(value ?? PADDING_TOP)
                    }
                />
                <PageBuilderSlider
                    title="Bottom padding"
                    min={0}
                    max={120}
                    value={paddingBottom}
                    unit="px"
                    onChange={(value?: number) =>
                        setPaddingBottom(value ?? PADDING_BOTTOM)
                    }
                />
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Back to top" value="back-to-top">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                        Show back-to-top control
                    </span>
                    <Checkbox
                        checked={backToTopEnabled}
                        onChange={(checked: boolean) =>
                            setBackToTopEnabled(checked)
                        }
                    />
                </div>
                {backToTopEnabled && (
                    <>
                        <Form>
                            <FormField
                                label="Accessible label"
                                value={backToTopLabel}
                                tooltip="Announced by screen readers; the control itself is icon-only."
                                onChange={(e: any) =>
                                    setBackToTopLabel(e.target.value)
                                }
                            />
                        </Form>
                        <PageBuilderSlider
                            title="Reveal after"
                            min={0}
                            max={600}
                            value={backToTopReveal}
                            unit="px"
                            onChange={(value?: number) =>
                                setBackToTopReveal(value ?? 100)
                            }
                        />
                    </>
                )}
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Advanced" value="advanced">
                <CssIdField value={cssId} onChange={setCssId} />
            </AdminWidgetPanel>
        </AdminWidgetPanelContainer>
    );
}
