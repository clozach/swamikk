"use client";

import { AppSidebar } from "@components/admin/dashboard-skeleton/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

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
 */
export default function LayoutWithSidebar({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <SidebarProvider className="courselit-theme">
            <AppSidebar />
            <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
    );
}
