import React, { useEffect, useState } from "react";
import type { Address, Media, Profile } from "@courselit/common-models";
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
    CssIdField,
    Form,
    FormField,
    IconButton,
    MediaSelector,
    PageBuilderPropertyHeader,
} from "@courselit/components-library";
import { generateUniqueId } from "@courselit/utils";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import Settings, { MenuItem, TopBarItem } from "./settings";
import {
    homeHref as defaultHomeHref,
    logoAlt as defaultLogoAlt,
    logoHeight as defaultLogoHeight,
    logoSrc as defaultLogoSrc,
    logoWidth as defaultLogoWidth,
    menu as defaultMenu,
    mobileCloseLabel as defaultMobileCloseLabel,
    mobileCtaHref as defaultMobileCtaHref,
    mobileCtaLabel as defaultMobileCtaLabel,
    mobileMenuLabel as defaultMobileMenuLabel,
    showTopBar as defaultShowTopBar,
    sticky as defaultSticky,
    showThemeToggle as defaultShowThemeToggle,
    topBarLeftItems as defaultTopBarLeftItems,
    topBarRightItems as defaultTopBarRightItems,
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

/** Nesting stops at three levels — About > Yoga > Hatha is the deepest
 *  branch the live site has, and deeper trees have nowhere to render. */
const MAX_DEPTH = 2;

/* ------------------------------------------------------------------ *
 * Reordering helpers (pure — they never mutate the incoming array)
 * ------------------------------------------------------------------ */
function replaceAt<T>(items: T[], index: number, item: T): T[] {
    const next = [...items];
    next[index] = item;
    return next;
}

function removeAt<T>(items: T[], index: number): T[] {
    return items.filter((_, position) => position !== index);
}

function swap<T>(items: T[], index: number, delta: number): T[] {
    const target = index + delta;
    if (target < 0 || target >= items.length) {
        return items;
    }
    const next = [...items];
    next[index] = items[target];
    next[target] = items[index];
    return next;
}

function RowControls({
    onMoveUp,
    onMoveDown,
    onDelete,
    canMoveUp,
    canMoveDown,
    label,
}: {
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDelete: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
    label: string;
}) {
    return (
        <div className="flex shrink-0 gap-1">
            <IconButton
                onClick={onMoveUp}
                disabled={!canMoveUp}
                aria-label={`Move ${label} up`}
            >
                <ArrowUp className="h-4 w-4" />
            </IconButton>
            <IconButton
                onClick={onMoveDown}
                disabled={!canMoveDown}
                aria-label={`Move ${label} down`}
            >
                <ArrowDown className="h-4 w-4" />
            </IconButton>
            <IconButton onClick={onDelete} aria-label={`Delete ${label}`}>
                <Trash2 className="h-4 w-4" />
            </IconButton>
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * Flat editor — the cocoa utility strip (Cart / Search / Menu / Contact)
 * ------------------------------------------------------------------ */
function TopBarItemsEditor({
    items,
    onChange,
    addLabel,
}: {
    items: TopBarItem[];
    onChange: (items: TopBarItem[]) => void;
    addLabel: string;
}) {
    return (
        <div className="flex flex-col gap-3">
            {items.map((item, index) => (
                <div
                    key={item.id}
                    className="flex items-end gap-2 rounded border border-border p-2"
                >
                    <Form className="flex grow flex-col gap-2">
                        <FormField
                            label="Label"
                            value={item.label}
                            onChange={(e: any) =>
                                onChange(
                                    replaceAt(items, index, {
                                        ...item,
                                        label: e.target.value,
                                    }),
                                )
                            }
                        />
                        <FormField
                            label="Link"
                            value={item.href}
                            tooltip="Use # for a placeholder link"
                            onChange={(e: any) =>
                                onChange(
                                    replaceAt(items, index, {
                                        ...item,
                                        href: e.target.value,
                                    }),
                                )
                            }
                        />
                    </Form>
                    <RowControls
                        label={item.label}
                        canMoveUp={index > 0}
                        canMoveDown={index < items.length - 1}
                        onMoveUp={() => onChange(swap(items, index, -1))}
                        onMoveDown={() => onChange(swap(items, index, 1))}
                        onDelete={() => onChange(removeAt(items, index))}
                    />
                </div>
            ))}
            <div className="flex justify-end">
                <Button
                    component="button"
                    onClick={() =>
                        onChange([
                            ...items,
                            {
                                id: generateUniqueId(),
                                label: "New item",
                                href: "#",
                            },
                        ])
                    }
                >
                    {addLabel}
                </Button>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * Recursive editor — the navigation tree
 * ------------------------------------------------------------------ */
function MenuItemFields({
    item,
    onChange,
    depth,
}: {
    item: MenuItem;
    onChange: (item: MenuItem) => void;
    depth: number;
}) {
    const children = item.children ?? [];

    return (
        <div className="flex flex-col gap-3">
            <Form className="flex flex-col gap-2">
                <FormField
                    label="Label"
                    value={item.label}
                    onChange={(e: any) =>
                        onChange({ ...item, label: e.target.value })
                    }
                />
                <FormField
                    label="Link"
                    value={item.href}
                    tooltip="Use # for a placeholder link"
                    onChange={(e: any) =>
                        onChange({ ...item, href: e.target.value })
                    }
                />
            </Form>
            {depth < MAX_DEPTH && (
                <div className="flex flex-col gap-2 border-l-2 border-border pl-3">
                    {children.length > 0 && (
                        <p className="text-sm font-medium">Sub-items</p>
                    )}
                    {children.map((child, index) => (
                        <div
                            key={child.id}
                            className="flex flex-col gap-2 rounded border border-border p-2"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium">
                                    {child.label || "[empty]"}
                                </span>
                                <RowControls
                                    label={child.label}
                                    canMoveUp={index > 0}
                                    canMoveDown={index < children.length - 1}
                                    onMoveUp={() =>
                                        onChange({
                                            ...item,
                                            children: swap(children, index, -1),
                                        })
                                    }
                                    onMoveDown={() =>
                                        onChange({
                                            ...item,
                                            children: swap(children, index, 1),
                                        })
                                    }
                                    onDelete={() =>
                                        onChange({
                                            ...item,
                                            children: removeAt(children, index),
                                        })
                                    }
                                />
                            </div>
                            <MenuItemFields
                                item={child}
                                depth={depth + 1}
                                onChange={(updated) =>
                                    onChange({
                                        ...item,
                                        children: replaceAt(
                                            children,
                                            index,
                                            updated,
                                        ),
                                    })
                                }
                            />
                        </div>
                    ))}
                    <div className="flex justify-end">
                        <Button
                            component="button"
                            onClick={() =>
                                onChange({
                                    ...item,
                                    children: [
                                        ...children,
                                        {
                                            id: generateUniqueId(),
                                            label: "New link",
                                            href: "#",
                                        },
                                    ],
                                })
                            }
                        >
                            Add sub-item
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

function MenuEditor({
    menu,
    onChange,
}: {
    menu: MenuItem[];
    onChange: (menu: MenuItem[]) => void;
}) {
    return (
        <>
            <Accordion type="single" collapsible className="w-full">
                {menu.map((item, index) => (
                    <AccordionItem key={item.id} value={item.id}>
                        <AccordionTrigger>
                            {item.label || "[empty]"}
                        </AccordionTrigger>
                        <AccordionContent className="flex flex-col gap-3">
                            <div className="flex justify-end">
                                <RowControls
                                    label={item.label}
                                    canMoveUp={index > 0}
                                    canMoveDown={index < menu.length - 1}
                                    onMoveUp={() =>
                                        onChange(swap(menu, index, -1))
                                    }
                                    onMoveDown={() =>
                                        onChange(swap(menu, index, 1))
                                    }
                                    onDelete={() =>
                                        onChange(removeAt(menu, index))
                                    }
                                />
                            </div>
                            <MenuItemFields
                                item={item}
                                depth={0}
                                onChange={(updated) =>
                                    onChange(replaceAt(menu, index, updated))
                                }
                            />
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
            <div className="mt-4 flex justify-end">
                <Button
                    component="button"
                    onClick={() =>
                        onChange([
                            ...menu,
                            {
                                id: generateUniqueId(),
                                label: "New link",
                                href: "#",
                            },
                        ])
                    }
                >
                    Add menu item
                </Button>
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ *
 * The panel
 * ------------------------------------------------------------------ */
export default function AdminWidget({
    settings,
    onChange,
    address,
    profile,
}: AdminWidgetProps): JSX.Element {
    const [logoMedia, setLogoMedia] = useState<Partial<Media>>(
        settings.logoMedia || {},
    );
    const [logoSrc, setLogoSrc] = useState(settings.logoSrc ?? defaultLogoSrc);
    const [logoAlt, setLogoAlt] = useState(settings.logoAlt ?? defaultLogoAlt);
    const [logoWidth, setLogoWidth] = useState(
        settings.logoWidth ?? defaultLogoWidth,
    );
    const [logoHeight, setLogoHeight] = useState(
        settings.logoHeight ?? defaultLogoHeight,
    );
    const [homeHref, setHomeHref] = useState(
        settings.homeHref ?? defaultHomeHref,
    );
    const [showTopBar, setShowTopBar] = useState(
        settings.showTopBar ?? defaultShowTopBar,
    );
    const [sticky, setSticky] = useState(settings.sticky ?? defaultSticky);
    const [showThemeToggle, setShowThemeToggle] = useState<boolean>(
        settings.showThemeToggle ?? defaultShowThemeToggle,
    );
    const [topBarLeftItems, setTopBarLeftItems] = useState<TopBarItem[]>(
        settings.topBarLeftItems ?? defaultTopBarLeftItems,
    );
    const [topBarRightItems, setTopBarRightItems] = useState<TopBarItem[]>(
        settings.topBarRightItems ?? defaultTopBarRightItems,
    );
    const [menu, setMenu] = useState<MenuItem[]>(settings.menu ?? defaultMenu);
    const [mobileMenuLabel, setMobileMenuLabel] = useState(
        settings.mobileMenuLabel ?? defaultMobileMenuLabel,
    );
    const [mobileCtaLabel, setMobileCtaLabel] = useState(
        settings.mobileCtaLabel ?? defaultMobileCtaLabel,
    );
    const [mobileCtaHref, setMobileCtaHref] = useState(
        settings.mobileCtaHref ?? defaultMobileCtaHref,
    );
    const [mobileCloseLabel, setMobileCloseLabel] = useState(
        settings.mobileCloseLabel ?? defaultMobileCloseLabel,
    );
    const [cssId, setCssId] = useState(settings.cssId);

    useEffect(() => {
        onChange({
            logoMedia,
            logoSrc,
            logoAlt,
            logoWidth,
            logoHeight,
            homeHref,
            showTopBar,
            sticky,
            showThemeToggle,
            topBarLeftItems,
            topBarRightItems,
            menu,
            mobileMenuLabel,
            mobileCtaLabel,
            mobileCtaHref,
            mobileCloseLabel,
            cssId,
        });
    }, [
        logoMedia,
        logoSrc,
        logoAlt,
        logoWidth,
        logoHeight,
        homeHref,
        showTopBar,
        sticky,
        showThemeToggle,
        topBarLeftItems,
        topBarRightItems,
        menu,
        mobileMenuLabel,
        mobileCtaLabel,
        mobileCtaHref,
        mobileCloseLabel,
        cssId,
    ]);

    return (
        <AdminWidgetPanelContainer
            type="multiple"
            defaultValue={["branding", "menu"]}
        >
            <AdminWidgetPanel title="Branding" value="branding">
                <Form className="flex flex-col gap-2">
                    <FormField
                        label="Logo path"
                        value={logoSrc}
                        tooltip="A path served from /public, e.g. /swami-kk-logo.png. A logo picked below overrides this."
                        onChange={(e: any) => setLogoSrc(e.target.value)}
                    />
                    <FormField
                        label="Logo alt text"
                        value={logoAlt}
                        onChange={(e: any) => setLogoAlt(e.target.value)}
                    />
                    <FormField
                        label="Logo width (px)"
                        type="number"
                        value={logoWidth}
                        onChange={(e: any) =>
                            setLogoWidth(Number(e.target.value) || 0)
                        }
                    />
                    <FormField
                        label="Logo height (px)"
                        type="number"
                        value={logoHeight}
                        onChange={(e: any) =>
                            setLogoHeight(Number(e.target.value) || 0)
                        }
                    />
                    <FormField
                        label="Logo links to"
                        value={homeHref}
                        onChange={(e: any) => setHomeHref(e.target.value)}
                    />
                </Form>
                <PageBuilderPropertyHeader
                    label="Logo from media library"
                    tooltip="Optional. Overrides the logo path above."
                />
                <MediaSelector
                    title=""
                    src={logoMedia?.thumbnail}
                    srcTitle={logoMedia?.originalFileName}
                    profile={profile}
                    address={address}
                    onSelection={(media: Media) => media && setLogoMedia(media)}
                    onRemove={() => setLogoMedia({})}
                    strings={{}}
                    access="public"
                    mediaId={logoMedia?.mediaId}
                    type="page"
                />
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Top bar" value="topbar">
                <div className="flex items-center gap-2">
                    <Checkbox
                        checked={showTopBar}
                        onChange={(value: boolean) => setShowTopBar(value)}
                    />
                    <span className="text-sm font-medium">
                        Show the top bar
                    </span>
                </div>
                <p className="text-sm text-muted-foreground">
                    The right-hand group hides below 768px and the whole bar
                    hides below 560px.
                </p>
                <PageBuilderPropertyHeader
                    label="Left group"
                    tooltip="Shown on the left of the cocoa strip"
                />
                <TopBarItemsEditor
                    items={topBarLeftItems}
                    onChange={setTopBarLeftItems}
                    addLabel="Add left item"
                />
                <PageBuilderPropertyHeader
                    label="Right group"
                    tooltip="Hidden at the mobile breakpoint"
                />
                <TopBarItemsEditor
                    items={topBarRightItems}
                    onChange={setTopBarRightItems}
                    addLabel="Add right item"
                />
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Navigation" value="menu">
                <p className="text-sm text-muted-foreground">
                    Up to three levels deep. An item with sub-items still uses
                    its own link.
                </p>
                <MenuEditor menu={menu} onChange={setMenu} />
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Mobile bar" value="mobile">
                <Form className="flex flex-col gap-2">
                    <FormField
                        label="Menu button label"
                        value={mobileMenuLabel}
                        onChange={(e: any) =>
                            setMobileMenuLabel(e.target.value)
                        }
                    />
                    <FormField
                        label="Call-to-action label"
                        value={mobileCtaLabel}
                        onChange={(e: any) => setMobileCtaLabel(e.target.value)}
                    />
                    <FormField
                        label="Call-to-action link"
                        value={mobileCtaHref}
                        onChange={(e: any) => setMobileCtaHref(e.target.value)}
                    />
                    <FormField
                        label="Close button screen-reader label"
                        value={mobileCloseLabel}
                        onChange={(e: any) =>
                            setMobileCloseLabel(e.target.value)
                        }
                    />
                </Form>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Advanced" value="advanced">
                <div className="flex items-center gap-2">
                    <Checkbox
                        checked={sticky}
                        onChange={(value: boolean) => setSticky(value)}
                    />
                    <span className="text-sm font-medium">
                        Pin header to top while scrolling
                    </span>
                </div>
                <p className="text-sm text-muted-foreground">
                    Matches anahata-retreat.org.nz: the top bar scrolls away
                    normally, and the logo/nav band stays pinned to the top of
                    the screen.
                </p>
                <div className="flex items-center gap-2">
                    <Checkbox
                        checked={showThemeToggle}
                        onChange={(value: boolean) => setShowThemeToggle(value)}
                    />
                    <span className="text-sm font-medium">
                        Show the light/dark switch in the nav
                    </span>
                </div>
                <p className="text-sm text-muted-foreground">
                    Sits at the end of the nav, after the last menu item. It
                    switches the CourseLit theme, which is what colours
                    checkout, forms and product pages.
                </p>
                <CssIdField
                    value={cssId || ""}
                    onChange={(value: string) => setCssId(value)}
                />
            </AdminWidgetPanel>
        </AdminWidgetPanelContainer>
    );
}
