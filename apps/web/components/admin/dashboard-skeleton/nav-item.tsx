"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { isValidElement, type ReactNode } from "react";

import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    useSidebar,
} from "@/components/ui/sidebar";
import { Chip } from "@courselit/components-library";
import { BETA_LABEL } from "@ui-config/strings";

export type NavSubItem = {
    title: string;
    url: string;
    isActive?: boolean;
};

export type NavItemData = {
    title: string;
    url: string;
    /** A lucide component, or an already-rendered element (a progress ring). */
    icon?: LucideIcon | ReactNode;
    isActive?: boolean;
    beta?: boolean;
    items?: NavSubItem[];
};

function NavIcon({ icon }: { icon: NavItemData["icon"] }) {
    if (!icon) return null;
    if (isValidElement(icon)) return icon;
    const Icon = icon as LucideIcon;
    return <Icon />;
}

/**
 * One sidebar entry, in whichever shape the sidebar's state calls for.
 *
 * An entry without pages is a link. An entry with pages unfolds them in
 * place while the sidebar is expanded — but the rail hides every unfolded
 * list (`SidebarMenuSub` is display:none under `collapsible=icon`), so the
 * same toggle in the collapsed rail flipped an invisible list and looked
 * dead. In the rail the entry opens its pages as a menu beside the icon
 * instead, which is what the hover tooltip already promises. On a phone
 * the sidebar is a sheet and is never collapsed, so it keeps the fold.
 */
export function NavItem({
    item,
    size = "default",
}: {
    item: NavItemData;
    size?: "default" | "sm";
}) {
    const { isMobile, state } = useSidebar();
    const pages = item.items ?? [];

    if (pages.length === 0) {
        return (
            <SidebarMenuItem>
                <SidebarMenuButton
                    asChild
                    size={size}
                    isActive={item.isActive}
                    tooltip={item.title}
                >
                    <Link href={item.url}>
                        <NavIcon icon={item.icon} />
                        <span>{item.title}</span>
                        {item.beta && <Chip>{BETA_LABEL}</Chip>}
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
        );
    }

    if (!isMobile && state === "collapsed") {
        return (
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size={size}
                            isActive={item.isActive}
                            tooltip={item.title}
                        >
                            <NavIcon icon={item.icon} />
                            <span>{item.title}</span>
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        side="right"
                        align="start"
                        sideOffset={4}
                        className="min-w-48 rounded-lg"
                    >
                        <DropdownMenuLabel>{item.title}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {pages.map((page) => (
                            <DropdownMenuItem key={page.title} asChild>
                                <Link
                                    href={page.url}
                                    aria-current={
                                        page.isActive ? "page" : undefined
                                    }
                                >
                                    {page.title}
                                </Link>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        );
    }

    return (
        <Collapsible
            asChild
            defaultOpen={item.isActive}
            className="group/collapsible"
        >
            <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                    <SidebarMenuButton size={size} tooltip={item.title}>
                        <NavIcon icon={item.icon} />
                        <span>{item.title}</span>
                        {item.beta && <Chip>{BETA_LABEL}</Chip>}
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenuSub>
                        {pages.map((page) => (
                            <SidebarMenuSubItem key={page.title}>
                                <SidebarMenuSubButton
                                    asChild
                                    isActive={page.isActive}
                                >
                                    <Link href={page.url}>
                                        <span>{page.title}</span>
                                    </Link>
                                </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                        ))}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </SidebarMenuItem>
        </Collapsible>
    );
}
