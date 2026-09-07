"use client";

import Link from "next/link";
import { useContext } from "react";
import { checkPermission } from "@courselit/utils";
import { UIConstants } from "@courselit/common-models";
import { ProfileContext } from "@components/contexts";
import { Button } from "@/components/ui/button";
import { feedbackUi as copy } from "@config/strings";
import {
    SIDEBAR_MENU_BLOGS,
    SIDEBAR_MENU_PAGES,
    MANAGE_COURSES_PAGE_HEADING,
} from "@ui-config/strings";

/** Removable navigation seam. No prompt workflow imports the legacy editors. */
export default function LegacyBuilder() {
    const { profile } = useContext(ProfileContext);
    const permissions = profile?.permissions || [];
    const { manageCourse, manageAnyCourse, publishCourse, manageSite } =
        UIConstants.permissions;
    const links = [
        {
            title: MANAGE_COURSES_PAGE_HEADING,
            href: "/dashboard/products",
            allowed: checkPermission(permissions, [
                manageCourse,
                manageAnyCourse,
            ]),
        },
        {
            title: SIDEBAR_MENU_BLOGS,
            href: "/dashboard/blogs",
            allowed: permissions.includes(publishCourse),
        },
        {
            title: SIDEBAR_MENU_PAGES,
            href: "/dashboard/pages",
            allowed: permissions.includes(manageSite),
        },
    ].filter((link) => link.allowed);
    return (
        <main className="max-w-4xl p-6 md:p-10">
            <h1 className="text-3xl font-semibold mb-4">{copy.legacy}</h1>
            <p className="text-muted-foreground mb-8">
                {links.length ? copy.legacyDescription : copy.accessDenied}
            </p>
            <nav className="flex flex-wrap gap-4">
                {links.map((link) => (
                    <Button
                        key={link.href}
                        asChild
                        variant="outline"
                        className="min-h-11"
                    >
                        <Link href={link.href}>{link.title}</Link>
                    </Button>
                ))}
            </nav>
        </main>
    );
}
