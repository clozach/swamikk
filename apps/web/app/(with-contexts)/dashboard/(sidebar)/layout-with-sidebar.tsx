"use client";

import { AppSidebar } from "@components/admin/dashboard-skeleton/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { usePrivatePalette } from "@/lib/use-private-palette";
import { cn } from "@/lib/shadcn-utils";
import { ProfileContext } from "@components/contexts";
import { checkPermission } from "@courselit/utils";
import { ADMIN_PERMISSIONS } from "@ui-config/constants";
import { useContext } from "react";

/**
 * The dashboard shell.
 *
 * This is not an admin-only area: /dashboard/my-content is where a paying
 * member goes to reach what they bought, and it renders here. So the shell
 * has to look like the school it belongs to, not like generic tooling.
 *
 * Two things used to stop that. It wrapped its children in a ThemeContext
 * pinned to CourseLit's stock "classic" theme, overriding the site's own
 * theme that (with-contexts) already provides one level up; and it was the
 * only shell in the app that never carried the `courselit-theme` class, so
 * none of the theme's CSS variables reached it either. The storefront shell
 * (base-layout/template) and the course player both carry that class — this
 * one now does the same, and lets the real theme through instead of
 * shadowing it.
 *
 * The sidebar is admin-only, and not as a matter of taste. Every entry in it
 * is gated on a permission a student never holds, except one hardcoded
 * single-element array — "My content". So a student was being given a 16rem
 * rail to hold exactly one link, forever: not a container that happens to be
 * sparse today, but one that cannot fill. It reads as a permission-starved
 * admin console rather than as their own library. Their in-page tab strip
 * already carries what navigation they have.
 */
export default function LayoutWithSidebar({
    children,
}: {
    children: React.ReactNode;
}) {
    const privatePalette = usePrivatePalette();
    const { profile } = useContext(ProfileContext);

    // Undecided until the profile arrives. Rendering the rail and then
    // yanking it would be a worse first paint than a beat without it.
    const isAdmin =
        !!profile &&
        checkPermission(profile.permissions ?? [], ADMIN_PERMISSIONS);

    return (
        <SidebarProvider className={cn("courselit-theme", privatePalette)}>
            {isAdmin ? <AppSidebar /> : null}
            <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
    );
}
