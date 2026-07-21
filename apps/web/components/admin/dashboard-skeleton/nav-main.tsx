"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";

import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { Chip } from "@courselit/components-library";
import { BETA_LABEL } from "@ui-config/strings";

type NavMainItem = {
    title: string;
    url: string;
    icon?: LucideIcon;
    isActive?: boolean;
    beta?: boolean;
    items?: {
        title: string;
        url: string;
        isActive?: boolean;
    }[];
};

export type NavMainGroup = {
    label: string;
    items: NavMainItem[];
};

export function NavMain({ groups }: { groups: NavMainGroup[] }) {
    return (
        <>
            {groups.map(
                (group) =>
                    group.items.length > 0 && (
                        <SidebarGroup key={group.label}>
                            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                            <SidebarMenu>
                                {group.items.map((item) =>
                                    item.items?.length ? (
                                        <Collapsible
                                            key={item.title}
                                            asChild
                                            defaultOpen={item.isActive}
                                            className="group/collapsible"
                                        >
                                            <SidebarMenuItem>
                                                <CollapsibleTrigger asChild>
                                                    <SidebarMenuButton
                                                        tooltip={item.title}
                                                    >
                                                        {item.icon && (
                                                            <item.icon />
                                                        )}
                                                        <span>
                                                            {item.title}
                                                        </span>
                                                        {item.beta && (
                                                            <Chip>
                                                                {BETA_LABEL}
                                                            </Chip>
                                                        )}
                                                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                                    </SidebarMenuButton>
                                                </CollapsibleTrigger>
                                                {item.items?.length ? (
                                                    <CollapsibleContent>
                                                        <SidebarMenuSub>
                                                            {item.items.map(
                                                                (item) => (
                                                                    <SidebarMenuSubItem
                                                                        key={
                                                                            item.title
                                                                        }
                                                                    >
                                                                        <SidebarMenuSubButton
                                                                            asChild
                                                                            isActive={
                                                                                item.isActive
                                                                            }
                                                                        >
                                                                            <Link
                                                                                href={
                                                                                    item.url
                                                                                }
                                                                            >
                                                                                <span>
                                                                                    {
                                                                                        item.title
                                                                                    }
                                                                                </span>
                                                                            </Link>
                                                                        </SidebarMenuSubButton>
                                                                    </SidebarMenuSubItem>
                                                                ),
                                                            )}
                                                        </SidebarMenuSub>
                                                    </CollapsibleContent>
                                                ) : null}
                                            </SidebarMenuItem>
                                        </Collapsible>
                                    ) : (
                                        <SidebarMenuItem key={item.title}>
                                            <SidebarMenuButton
                                                asChild
                                                isActive={item.isActive}
                                                tooltip={item.title}
                                            >
                                                <Link href={item.url}>
                                                    {item.icon && <item.icon />}
                                                    <span>{item.title}</span>
                                                    {item.beta && (
                                                        <Chip>
                                                            {BETA_LABEL}
                                                        </Chip>
                                                    )}
                                                </Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    ),
                                )}
                            </SidebarMenu>
                        </SidebarGroup>
                    ),
            )}
        </>
    );
}
