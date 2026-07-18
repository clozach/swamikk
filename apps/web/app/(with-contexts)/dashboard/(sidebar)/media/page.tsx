"use client";

import DashboardContent from "@components/admin/dashboard-content";
import LoadingScreen from "@components/admin/loading-screen";
import MediaLibrary from "@components/admin/media/media-library";
import { ProfileContext } from "@components/contexts";
import { UIConstants } from "@courselit/common-models";
import { checkPermission } from "@courselit/utils";
import { MEDIA_MANAGER_PAGE_HEADING } from "@ui-config/strings";
import { ADMIN_PERMISSIONS } from "@ui-config/constants";
import { useContext } from "react";

const { permissions } = UIConstants;

const breadcrumbs = [{ label: MEDIA_MANAGER_PAGE_HEADING, href: "#" }];

export default function Page() {
    const { profile } = useContext(ProfileContext);

    if (!profile) {
        return <LoadingScreen />;
    }

    // manageMedia alone is not enough: every signup gets it (so members can
    // attach images to community posts), and this page lists the whole
    // school's uploads, not the viewer's own. It needs an admin permission too.
    if (
        !checkPermission(profile.permissions ?? [], [
            permissions.manageMedia,
        ]) ||
        !checkPermission(profile.permissions ?? [], ADMIN_PERMISSIONS)
    ) {
        return <LoadingScreen />;
    }

    return (
        <DashboardContent breadcrumbs={breadcrumbs}>
            <MediaLibrary />
        </DashboardContent>
    );
}
