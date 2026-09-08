"use client";

import { NavMain } from "@components/admin/dashboard-skeleton/nav-main";
import { NavProjects } from "@components/admin/dashboard-skeleton/nav-projects";
import { NavUser } from "@components/admin/dashboard-skeleton/nav-user";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
    useSidebar,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { Image } from "@courselit/components-library";
import { ProfileContext, SiteInfoContext } from "@components/contexts";
import { NavSecondary } from "./nav-secondary";
import { getSidebarItems } from "./sidebar-items";
import { usePathname, useSearchParams } from "next/navigation";
import { ComponentProps, useContext, useEffect, useState } from "react";
import { hasPermissionToAccessSetupChecklist } from "@/lib/utils";
import { getSetupChecklist } from "@/app/(with-contexts)/dashboard/(sidebar)/action";

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
    const siteInfo = useContext(SiteInfoContext);
    const { profile } = useContext(ProfileContext);
    const path = usePathname();
    const searchParams = useSearchParams();
    const tab = searchParams?.get("tab");
    const { setOpenMobile } = useSidebar();
    useEffect(() => {
        setOpenMobile(false);
    }, [path, tab, setOpenMobile]);
    const [checklist, setChecklist] = useState<string[]>([]);
    const [totalChecklistItems, setTotalChecklistItems] = useState<number>(0);

    useEffect(() => {
        const loadChecklist = async () => {
            try {
                const setupChecklist = await getSetupChecklist();
                if (!setupChecklist) {
                    return;
                }
                setChecklist(setupChecklist.checklist);
                setTotalChecklistItems(setupChecklist.total);
            } catch (error) {}
        };

        if (
            profile &&
            profile.userId &&
            hasPermissionToAccessSetupChecklist(profile.permissions!)
        ) {
            loadChecklist();
        }
    }, [profile]);

    if (!profile) {
        return null;
    }

    const { navGroups, navProjectItems, navSecondaryItems } = getSidebarItems({
        profile,
        path,
        tab,
        checklist,
        totalChecklistItems,
    });

    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href="/">
                                {/* No background behind the logo. The tile used
                                    to be filled with `bg-sidebar-primary`,
                                    which was invisible only because the
                                    dashboard rendered outside the theme and
                                    that variable fell back to a dark neutral.
                                    Once the theme reached this shell the fill
                                    became the brand's primary, putting a
                                    coloured plate behind a logo that already
                                    carries its own ground. A logo supplies its
                                    own backdrop; the chrome should not add
                                    one.

                                    In the collapsed rail this button is 32px
                                    wide, and the title block beside the tile
                                    kept its place in the row: its 8px gap
                                    squeezed the tile to 24px and the logo was
                                    cropped left of centre. The tile never
                                    shrinks and the title leaves the row while
                                    the rail is collapsed, so the logo gets
                                    the whole 32px. `contain` never crops a
                                    logo, whatever shape the next upload is. */}
                                <div className="flex aspect-square size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                                    <Image
                                        borderRadius={1}
                                        // Eager, not the wrapper's lazy default:
                                        // the brand logo is always above the fold,
                                        // and Safari intermittently never fires the
                                        // lazy load for it (blank/broken until a
                                        // repaint).
                                        loading="eager"
                                        src={siteInfo.logo?.file || ""}
                                        alt="logo"
                                        width="w-full"
                                        height="h-full"
                                        objectFit="contain"
                                    />
                                </div>
                                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                                    <span className="truncate font-semibold">
                                        {siteInfo.title}
                                    </span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <NavProjects projects={navProjectItems} />
                <NavMain groups={navGroups} />
                <NavSecondary items={navSecondaryItems} className="mt-auto" />
            </SidebarContent>
            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
}
