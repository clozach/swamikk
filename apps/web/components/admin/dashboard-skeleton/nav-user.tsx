"use client";

import {
    Bell,
    ChevronsUpDown,
    LibraryBig,
    LogOut,
    Receipt,
    UserPen,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar";
import { useContext } from "react";
import { ProfileContext } from "@components/contexts";
import Link from "next/link";
import { Chip } from "@courselit/components-library";
import { HideDuringMimic } from "@/components/member-mimic/context";
import { billingCopy } from "@/components/member-billing/copy";
import {
    BETA_LABEL,
    LOGOUT,
    MAIN_MENU_ITEM_NOTIFICATIONS,
    MAIN_MENU_ITEM_PROFILE,
    MY_CONTENT_HEADER,
} from "@ui-config/strings";

export function NavUser({
    compactOnMobile = false,
}: {
    compactOnMobile?: boolean;
}) {
    const { isMobile } = useSidebar();
    const { profile: user } = useContext(ProfileContext);
    if (!user) {
        return null;
    }
    const alias =
        user.name
            ?.trim()
            ?.split(" ")
            .slice(0, 2)
            .map((x) => x[0]?.toUpperCase())
            .join("") ||
        user.email?.charAt(0).toUpperCase() ||
        "M";

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            aria-label={`Account menu for ${user.name || user.email || "member"}`}
                            className={`data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground ${compactOnMobile ? "h-11 w-11 justify-center p-1.5 md:h-12 md:w-full md:justify-start md:p-2" : ""}`}
                        >
                            <Avatar className="h-8 w-8 rounded-full">
                                <AvatarImage
                                    src={user.avatar?.thumbnail}
                                    alt={user.name}
                                />
                                <AvatarFallback className="rounded-full">
                                    {alias}
                                </AvatarFallback>
                            </Avatar>
                            <div
                                className={`${compactOnMobile ? "hidden md:grid" : "grid"} min-w-0 flex-1 text-left text-sm leading-tight`}
                            >
                                <span className="truncate font-semibold">
                                    {user.name}
                                </span>
                                <span className="truncate text-xs">
                                    {user.email}
                                </span>
                            </div>
                            <ChevronsUpDown
                                className={`ml-auto size-4 ${compactOnMobile ? "hidden md:block" : ""}`}
                            />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                        side={isMobile ? "bottom" : "right"}
                        align="end"
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="p-0 font-normal">
                            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                <Avatar className="h-8 w-8 rounded-full">
                                    <AvatarImage
                                        src={user.avatar?.thumbnail}
                                        alt={user.name}
                                    />
                                    <AvatarFallback className="rounded-full">
                                        {alias}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-semibold">
                                        {user.name}
                                    </span>
                                    <span className="truncate text-xs">
                                        {user.email}
                                    </span>
                                </div>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <Link href="/dashboard/my-content">
                                <DropdownMenuItem>
                                    <LibraryBig />
                                    {MY_CONTENT_HEADER}
                                </DropdownMenuItem>
                            </Link>
                            <Link href={"/dashboard/profile"}>
                                <DropdownMenuItem>
                                    <UserPen />
                                    {MAIN_MENU_ITEM_PROFILE}
                                </DropdownMenuItem>
                            </Link>
                            <Link href="/dashboard/membership">
                                <DropdownMenuItem>
                                    <Receipt />
                                    {billingCopy.profileLink}
                                </DropdownMenuItem>
                            </Link>
                            <HideDuringMimic>
                                <Link href={"/dashboard/notifications"}>
                                    <DropdownMenuItem>
                                        <div className="flex items-center gap-2">
                                            <Bell />
                                            {MAIN_MENU_ITEM_NOTIFICATIONS}
                                        </div>
                                        <Chip>{BETA_LABEL}</Chip>
                                    </DropdownMenuItem>
                                </Link>
                            </HideDuringMimic>
                        </DropdownMenuGroup>
                        {/* <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuItem>
                                <BadgeCheck />
                                Account
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <CreditCard />
                                Billing
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <Bell />
                                Notifications
                            </DropdownMenuItem>
                        </DropdownMenuGroup> */}
                        <HideDuringMimic>
                            <DropdownMenuSeparator />
                            <Link href={"/logout"}>
                                <DropdownMenuItem>
                                    <LogOut />
                                    {LOGOUT}
                                </DropdownMenuItem>
                            </Link>
                        </HideDuringMimic>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
