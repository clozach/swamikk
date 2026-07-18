"use client";

import { ProfileContext, SiteInfoContext } from "@components/contexts";
import { Image } from "@courselit/components-library";
import { NotificationsViewer } from "@components/notifications-viewer";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@components/ui/breadcrumb";
import { Separator } from "@components/ui/separator";
import { SidebarTrigger } from "@components/ui/sidebar";
import { checkPermission } from "@courselit/utils";
import Link from "next/link";
import { Fragment, ReactNode, useContext } from "react";
import LoadingScreen from "./loading-screen";
import PermissionError from "./permission-error";

import NextThemeSwitcher from "./next-theme-switcher";
import { NavUser } from "./dashboard-skeleton/nav-user";
import { ADMIN_PERMISSIONS } from "@ui-config/constants";

export default function DashboardContent({
    breadcrumbs,
    children,
    permissions = [],
}: {
    breadcrumbs: {
        label: string;
        href: string;
    }[];
    children: ReactNode;
    permissions?: string[];
}) {
    const { profile } = useContext(ProfileContext);
    const siteInfo = useContext(SiteInfoContext);

    if (!profile || !profile.userId) {
        return <LoadingScreen />;
    }

    // Students get no sidebar (see layout-with-sidebar), so the two things it
    // used to hold — the collapse toggle and the account menu — have to live
    // here instead, or they lose their way to sign out entirely.
    const isAdmin = checkPermission(
        profile.permissions ?? [],
        ADMIN_PERMISSIONS,
    );

    return (
        <>
            <header className="flex h-16 shrink-0 items-center gap-2">
                <div className="flex items-center gap-2 px-4">
                    {isAdmin ? (
                        <>
                            <SidebarTrigger className="-ml-1" />
                            <Separator
                                orientation="vertical"
                                className="mr-2 h-4"
                            />
                        </>
                    ) : null}
                    {!isAdmin ? (
                        <Link
                            href="/"
                            className="flex items-center gap-2 font-semibold"
                        >
                            <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg">
                                <Image
                                    borderRadius={1}
                                    src={siteInfo.logo?.file || ""}
                                    alt="logo"
                                    className="h-full w-full object-cover"
                                />
                            </div>
                            <span className="truncate text-sm">
                                {siteInfo.title}
                            </span>
                        </Link>
                    ) : null}
                    {isAdmin && breadcrumbs.length > 0 && (
                        <Breadcrumb>
                            <BreadcrumbList>
                                {breadcrumbs.map((breadcrumb, index) => (
                                    <Fragment key={index}>
                                        {index < breadcrumbs.length - 1 && (
                                            <>
                                                <BreadcrumbItem className="hidden md:block">
                                                    <BreadcrumbLink asChild>
                                                        <Link
                                                            href={
                                                                breadcrumb.href
                                                            }
                                                        >
                                                            {breadcrumb.label}
                                                        </Link>
                                                    </BreadcrumbLink>
                                                </BreadcrumbItem>
                                                <BreadcrumbSeparator className="hidden md:block" />
                                            </>
                                        )}
                                        {index === breadcrumbs.length - 1 && (
                                            <BreadcrumbItem>
                                                <BreadcrumbPage>
                                                    {breadcrumb.label}
                                                </BreadcrumbPage>
                                            </BreadcrumbItem>
                                        )}
                                    </Fragment>
                                ))}
                                {/* <BreadcrumbItem className="hidden md:block">
                                    <BreadcrumbLink href="#">
                                        Building Your Application
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden md:block" />
                                <BreadcrumbItem>
                                    <BreadcrumbPage>
                                        Data Fetching
                                    </BreadcrumbPage>
                                </BreadcrumbItem> */}
                            </BreadcrumbList>
                        </Breadcrumb>
                    )}
                </div>
                <div className="ml-auto flex items-center gap-2 px-3">
                    <NextThemeSwitcher variant="ghost" />
                    <NotificationsViewer />
                    {isAdmin ? null : (
                        <div className="w-56">
                            <NavUser />
                        </div>
                    )}
                </div>
            </header>
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                {permissions.length > 0 ? (
                    checkPermission(profile.permissions!, permissions) ? (
                        children
                    ) : (
                        <PermissionError missingPermissions={permissions} />
                    )
                ) : (
                    children
                )}
            </div>
        </>
    );
}
