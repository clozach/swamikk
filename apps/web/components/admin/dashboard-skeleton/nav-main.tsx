"use client";

import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
} from "@/components/ui/sidebar";
import { NavItem, type NavItemData } from "./nav-item";

export type NavMainGroup = {
    label: string;
    items: NavItemData[];
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
                                {group.items.map((item) => (
                                    <NavItem key={item.title} item={item} />
                                ))}
                            </SidebarMenu>
                        </SidebarGroup>
                    ),
            )}
        </>
    );
}
