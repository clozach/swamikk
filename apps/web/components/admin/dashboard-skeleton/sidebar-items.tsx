import {
    BookUser,
    Box,
    CalendarDays,
    HandCoins,
    Images,
    LibraryBig,
    LifeBuoy,
    Mail,
    MessageCircleHeart,
    MessageSquareDiff,
    Receipt,
    Settings,
    Target,
    Users,
    Wrench,
    type LucideIcon,
} from "lucide-react";

import { CircularProgress } from "@components/circular-progress";
import { checkPermission } from "@courselit/utils";
import { Profile, UIConstants } from "@courselit/common-models";
import {
    ADMIN_PERMISSIONS,
    FEEDBACK_ADMIN_PERMISSIONS,
} from "@ui-config/constants";
import { dripAdminUi, feedbackUi as feedbackCopy } from "@config/strings";
import {
    BROADCASTS,
    GET_SET_UP,
    MY_CONTENT_HEADER,
    SEQUENCES,
    SIDEBAR_MENU_COHORTS,
    SIDEBAR_MENU_MAILS,
    SIDEBAR_MENU_MEDIA,
    SIDEBAR_MENU_SETTINGS,
    SIDEBAR_MENU_SUBSCRIBERS,
    SIDEBAR_MENU_USERS,
    SITE_CUSTOMISATIONS_SETTING_HEADER,
    SITE_MISCELLANEOUS_SETTING_HEADER,
    SOCIAL_HERO_SETTINGS_HEADER,
    SITE_SETTINGS_SECTION_GENERAL,
    SITE_SETTINGS_SECTION_MAILS,
    SITE_SETTINGS_SECTION_PAYMENT,
    TEMPLATES,
} from "@ui-config/strings";
import type { NavItemData } from "./nav-item";
import type { NavMainGroup } from "./nav-main";

const { permissions } = UIConstants;

export type NavProjectItem = {
    name: string;
    url: string;
    icon: LucideIcon;
    isActive?: boolean;
};

/**
 * What the admin sidebar offers this profile, in three shapes: the
 * library link (`navProjectItems`), the themed groups (`navGroups`), and
 * the entries pinned to the foot of the rail (`navSecondaryItems`).
 *
 * The rail collapses to icons, and then the icon is the whole label. So
 * every entry carries a glyph no other entry uses — Transactions and
 * Refund review used to share the receipt, Communities and Comments &
 * changes the chat heart, and the rail read as the same door twice
 * (`sidebar-items.test.tsx` keeps them distinct). Settings sits at the
 * foot, directly above the Legacy builder, where the site-wide tools live.
 */
export function getSidebarItems({
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
}): {
    navGroups: NavMainGroup[];
    navSecondaryItems: NavItemData[];
    navProjectItems: NavProjectItem[];
} {
    // Insights pairs the aggregate Overview with the Transactions ledger
    // behind its "View transactions" link, so the underlying record for any
    // stat on Overview is one click away instead of being data with no
    // navigational home.
    const insightsItems: NavItemData[] = [];
    const contentItems: NavItemData[] = [];
    const audienceItems: NavItemData[] = [];
    const navSecondaryItems: NavItemData[] = [];
    const isTab = (page: string, name: string) =>
        `${path}?tab=${tab}` === `${page}?tab=${name}`;

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
            title: dripAdminUi.title,
            url: "/dashboard/releases",
            icon: CalendarDays,
            isActive: path === "/dashboard/releases",
        });
        contentItems.push({
            title: feedbackCopy.organize,
            url: "/dashboard/content",
            icon: Box,
            isActive: path === "/dashboard/content",
        });
    }
    if (checkPermission(profile.permissions!, [permissions.manageCommunity])) {
        contentItems.push({
            title: "Communities",
            beta: true,
            url: "/dashboard/communities",
            icon: MessageCircleHeart,
            isActive: path === "/dashboard/communities",
        });
    }
    if (checkPermission(profile.permissions!, FEEDBACK_ADMIN_PERMISSIONS)) {
        contentItems.push({
            title: feedbackCopy.review,
            url: "/dashboard/changes",
            icon: MessageSquareDiff,
            isActive: path === "/dashboard/changes",
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
        contentItems.push({
            title: SIDEBAR_MENU_MEDIA,
            url: "/dashboard/media",
            icon: Images,
            isActive: path === "/dashboard/media",
        });
    }
    if (profile.permissions!.includes(permissions.manageUsers)) {
        audienceItems.push({
            title: SIDEBAR_MENU_USERS,
            url: "/dashboard/users",
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
            icon: BookUser,
            isActive: path === "/dashboard/subscribers",
        });
        audienceItems.push({
            title: SIDEBAR_MENU_MAILS,
            beta: true,
            url: `/dashboard/mails?tab=${BROADCASTS}`,
            icon: Mail,
            isActive:
                path?.startsWith("/dashboard/mails") ||
                path?.startsWith("/dashboard/mail"),
            items: [BROADCASTS, SEQUENCES, TEMPLATES].map((name) => ({
                title: name,
                url: `/dashboard/mails?tab=${name}`,
                isActive: isTab("/dashboard/mails", name),
            })),
        });
    }
    if (profile.permissions!.includes(permissions.manageSettings)) {
        insightsItems.push({
            title: "Refund review",
            url: "/dashboard/refund-review",
            icon: HandCoins,
            isActive: path === "/dashboard/refund-review",
        });
    }

    const navGroups = [
        { label: "Insights", items: insightsItems },
        { label: "Content", items: contentItems },
        { label: "Audience", items: audienceItems },
    ].filter((group) => group.items.length > 0);

    const isAdmin =
        !!profile.permissions &&
        checkPermission(profile.permissions, ADMIN_PERMISSIONS);
    if (isAdmin && totalChecklistItems && checklist.length) {
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
    if (profile.permissions!.includes(permissions.manageSettings)) {
        const tabs = [
            SITE_SETTINGS_SECTION_GENERAL,
            SITE_SETTINGS_SECTION_PAYMENT,
            SITE_SETTINGS_SECTION_MAILS,
            SITE_CUSTOMISATIONS_SETTING_HEADER,
            SITE_MISCELLANEOUS_SETTING_HEADER,
        ].map((name) => ({
            title: name,
            url: `/dashboard/settings?tab=${encodeURIComponent(name)}`,
            isActive: isTab("/dashboard/settings", name),
        }));
        navSecondaryItems.push({
            title: SIDEBAR_MENU_SETTINGS,
            url: `/dashboard/settings?tab=${SITE_SETTINGS_SECTION_GENERAL}`,
            icon: Settings,
            isActive: path?.startsWith("/dashboard/settings"),
            items: [
                ...tabs,
                {
                    // A child PAGE (not a ?tab=), mirroring settings/apikeys.
                    title: SOCIAL_HERO_SETTINGS_HEADER,
                    url: `/dashboard/settings/social-hero`,
                    isActive: path === "/dashboard/settings/social-hero",
                },
            ],
        });
    }
    if (isAdmin) {
        navSecondaryItems.push({
            title: feedbackCopy.legacy,
            url: "/dashboard/legacy-builder",
            icon: Wrench,
            isActive: path === "/dashboard/legacy-builder",
        });
        navSecondaryItems.push({
            title: "Support",
            url: "/dashboard/support",
            icon: LifeBuoy,
            isActive: path === "/dashboard/support",
        });
    }

    const navProjectItems: NavProjectItem[] = [
        {
            name: MY_CONTENT_HEADER,
            url: "/dashboard/my-content",
            icon: LibraryBig,
            isActive: !!path && path.startsWith("/dashboard/my-content"),
        },
    ];

    return { navGroups, navSecondaryItems, navProjectItems };
}
