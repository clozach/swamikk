"use client";

import {
    Box,
    Globe,
    Images,
    LibraryBig,
    LifeBuoy,
    Mail,
    MailCheck,
    MessageCircleHeart,
    Receipt,
    Settings,
    Target,
    Text,
    Users,
} from "lucide-react";

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
} from "@/components/ui/sidebar";
import Link from "next/link";
import { Image } from "@courselit/components-library";
import { ProfileContext, SiteInfoContext } from "@components/contexts";
import { checkPermission } from "@courselit/utils";
import { Profile, UIConstants } from "@courselit/common-models";
import {
    BROADCASTS,
    GET_SET_UP,
    MY_CONTENT_HEADER,
    SEQUENCES,
    SIDEBAR_MENU_BLOGS,
    SIDEBAR_MENU_COHORTS,
    SIDEBAR_MENU_MAILS,
    SIDEBAR_MENU_MEDIA,
    SIDEBAR_MENU_PAGES,
    SIDEBAR_MENU_SETTINGS,
    SIDEBAR_MENU_SUBSCRIBERS,
    SIDEBAR_MENU_USERS,
    SITE_CUSTOMISATIONS_SETTING_HEADER,
    SITE_MISCELLANEOUS_SETTING_HEADER,
    SITE_SETTINGS_SECTION_GENERAL,
    SITE_SETTINGS_SECTION_MAILS,
    SITE_SETTINGS_SECTION_PAYMENT,
    TEMPLATES,
} from "@ui-config/strings";
import { NavSecondary } from "./nav-secondary";
import { usePathname, useSearchParams } from "next/navigation";
import { ComponentProps, useContext, useEffect, useState } from "react";
import { CircularProgress } from "@components/circular-progress";
import { hasPermissionToAccessSetupChecklist } from "@/lib/utils";
import { ADMIN_PERMISSIONS } from "@ui-config/constants";
import { getSetupChecklist } from "@/app/(with-contexts)/dashboard/(sidebar)/action";
const { permissions } = UIConstants;

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
    const siteInfo = useContext(SiteInfoContext);
    const { profile } = useContext(ProfileContext);
    const path = usePathname();
    const searchParams = useSearchParams();
    const tab = searchParams?.get("tab");
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
                                    one. */}
                                <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg">
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
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div className="grid flex-1 text-left text-sm leading-tight">
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

function getSidebarItems({
    profile,
    checklist = [],
    totalChecklistItems = 0,
    path,
    tab,
}: {
    profile: Partial<Profile>;
    checklist: string[];
    totalChecklistItems: number;
    path?: string | null;
    tab?: string | null;
}) {
    // Four themed groups instead of one flat "Create" list (that label was
    // template cruft — most of these pages are dashboards/settings, not
    // creation flows). Insights pairs the aggregate Overview with the
    // Transactions ledger behind its "View transactions" link, so the
    // underlying record for any stat on Overview is one click away instead
    // of being data with no navigational home.
    const insightsItems: any[] = [];
    const contentItems: any[] = [];
    const audienceItems: any[] = [];
    const systemItems: any[] = [];

    if (
        checkPermission(profile.permissions!, [
            permissions.manageCourse,
            permissions.manageAnyCourse,
        ])
    ) {
        insightsItems.push({
            title: "Overview",
            url: "/dashboard/overview",
            icon: Target,
            isActive: path === "/dashboard/overview",
        });
        insightsItems.push({
            title: "Transactions",
            url: "/dashboard/transactions",
            icon: Receipt,
            isActive: path === "/dashboard/transactions",
        });
        contentItems.push({
            title: "Products",
            url: "/dashboard/products",
            icon: Box,
            isActive:
                path === "/dashboard/products" ||
                path?.startsWith("/dashboard/product"),
            items: [],
        });
    }
    if (checkPermission(profile.permissions!, [permissions.manageCommunity])) {
        contentItems.push({
            title: "Communities",
            beta: true,
            url: "/dashboard/communities",
            icon: MessageCircleHeart,
            isActive: path === "/dashboard/communities",
            items: [],
        });
    }
    if (checkPermission(profile.permissions!, [permissions.publishCourse])) {
        contentItems.push({
            title: SIDEBAR_MENU_BLOGS,
            url: "/dashboard/blogs",
            icon: Text,
            isActive:
                path === "/dashboard/blogs" ||
                path?.startsWith("/dashboard/blog"),
            items: [],
        });
    }
    if (profile.permissions!.includes(permissions.manageSite)) {
        contentItems.push({
            title: SIDEBAR_MENU_PAGES,
            url: "/dashboard/pages",
            icon: Globe,
            isActive:
                path === "/dashboard/pages" ||
                path?.startsWith("/dashboard/page"),
            items: [],
        });
    }
    // The school-wide media library is an ADMIN surface, so it needs an admin
    // permission on top of manageMedia. manageMedia alone is not a proxy for
    // "runs this school": auth.ts grants it to every signup, because a member
    // needs it to attach an image to a community post. Gating this entry on it
    // alone put a "Create > Media" link into the sidebar of every paying
    // customer — and pointed it at a page listing every file in the school.
    if (
        profile.permissions!.includes(permissions.manageMedia) &&
        checkPermission(profile.permissions!, ADMIN_PERMISSIONS)
    ) {
        systemItems.push({
            title: SIDEBAR_MENU_MEDIA,
            url: "/dashboard/media",
            icon: Images,
            isActive: path === "/dashboard/media",
            items: [],
        });
    }
    if (profile.permissions!.includes(permissions.manageUsers)) {
        audienceItems.push({
            title: SIDEBAR_MENU_USERS,
            url: "#",
            icon: Users,
            isActive:
                path?.startsWith("/dashboard/users") ||
                path?.startsWith("/dashboard/cohorts"),
            items: [
                {
                    title: "All users",
                    url: "/dashboard/users",
                    isActive: path === "/dashboard/users",
                },
                {
                    title: "Tags",
                    url: "/dashboard/users/tags",
                    isActive: path === "/dashboard/users/tags",
                },
                {
                    title: SIDEBAR_MENU_COHORTS,
                    url: "/dashboard/cohorts",
                    isActive: path?.startsWith("/dashboard/cohorts"),
                },
            ],
        });
        audienceItems.push({
            title: SIDEBAR_MENU_SUBSCRIBERS,
            url: "/dashboard/subscribers",
            icon: MailCheck,
            isActive: path === "/dashboard/subscribers",
            items: [],
        });
        audienceItems.push({
            title: SIDEBAR_MENU_MAILS,
            beta: true,
            url: "#",
            icon: Mail,
            isActive:
                path?.startsWith("/dashboard/mails") ||
                path?.startsWith("/dashboard/mail"),
            items: [
                {
                    title: BROADCASTS,
                    url: `/dashboard/mails?tab=${BROADCASTS}`,
                    isActive:
                        `${path}?tab=${tab}` ===
                        `/dashboard/mails?tab=${BROADCASTS}`,
                },
                {
                    title: SEQUENCES,
                    url: `/dashboard/mails?tab=${SEQUENCES}`,
                    isActive:
                        `${path}?tab=${tab}` ===
                        `/dashboard/mails?tab=${SEQUENCES}`,
                },
                {
                    title: TEMPLATES,
                    url: `/dashboard/mails?tab=${TEMPLATES}`,
                    isActive:
                        `${path}?tab=${tab}` ===
                        `/dashboard/mails?tab=${TEMPLATES}`,
                },
            ],
        });
    }
    if (profile.permissions!.includes(permissions.manageSettings)) {
        const items = [
            {
                title: SITE_SETTINGS_SECTION_GENERAL,
                url: `/dashboard/settings?tab=${SITE_SETTINGS_SECTION_GENERAL}`,
                isActive:
                    `${path}?tab=${tab}` ===
                    `/dashboard/settings?tab=${SITE_SETTINGS_SECTION_GENERAL}`,
            },
            {
                title: SITE_SETTINGS_SECTION_PAYMENT,
                url: `/dashboard/settings?tab=${SITE_SETTINGS_SECTION_PAYMENT}`,
                isActive:
                    `${path}?tab=${tab}` ===
                    `/dashboard/settings?tab=${SITE_SETTINGS_SECTION_PAYMENT}`,
            },
            {
                title: SITE_SETTINGS_SECTION_MAILS,
                url: `/dashboard/settings?tab=${SITE_SETTINGS_SECTION_MAILS}`,
                isActive:
                    `${path}?tab=${tab}` ===
                    `/dashboard/settings?tab=${SITE_SETTINGS_SECTION_MAILS}`,
            },
            {
                title: SITE_CUSTOMISATIONS_SETTING_HEADER,
                url: `/dashboard/settings?tab=${encodeURIComponent(SITE_CUSTOMISATIONS_SETTING_HEADER)}`,
                isActive:
                    `${path}?tab=${tab}` ===
                    `/dashboard/settings?tab=${SITE_CUSTOMISATIONS_SETTING_HEADER}`,
            },
            {
                title: SITE_MISCELLANEOUS_SETTING_HEADER,
                url: `/dashboard/settings?tab=${SITE_MISCELLANEOUS_SETTING_HEADER}`,
                isActive:
                    `${path}?tab=${tab}` ===
                    `/dashboard/settings?tab=${SITE_MISCELLANEOUS_SETTING_HEADER}`,
            },
        ];
        systemItems.push({
            title: SIDEBAR_MENU_SETTINGS,
            url: "#",
            icon: Settings,
            isActive: path?.startsWith("/dashboard/settings"),
            items,
        });
    }

    const navGroups = [
        { label: "Insights", items: insightsItems },
        { label: "Content", items: contentItems },
        { label: "Audience", items: audienceItems },
        { label: "System", items: systemItems },
    ].filter((group) => group.items.length > 0);

    const navSecondaryItems: any[] = [];
    if (
        profile &&
        profile.permissions &&
        checkPermission(profile.permissions, ADMIN_PERMISSIONS)
    ) {
        if (totalChecklistItems && checklist.length) {
            navSecondaryItems.push({
                title: GET_SET_UP,
                url: "/dashboard/get-set-up",
                icon: (
                    <CircularProgress
                        strokeWidth={4}
                        value={
                            ((totalChecklistItems - checklist.length) /
                                totalChecklistItems) *
                            100
                        }
                    />
                ),
                isActive: path === "/dashboard/get-set-up",
            });
        }
        navSecondaryItems.push({
            title: "Support",
            url: "/dashboard/support",
            icon: <LifeBuoy />,
            isActive: path === "/dashboard/support",
        });
    }
    const navProjectItems = [
        {
            name: MY_CONTENT_HEADER,
            url: "/dashboard/my-content",
            icon: LibraryBig,
            isActive: !!path && path.startsWith("/dashboard/my-content"),
        },
    ];

    return { navGroups, navSecondaryItems, navProjectItems };
}
