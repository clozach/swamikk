"use client";

import DashboardContent from "@components/admin/dashboard-content";
import LoadingScreen from "@components/admin/loading-screen";
import MediaLibrary from "@components/admin/media/media-library";
import { ProfileContext } from "@components/contexts";
import { UIConstants } from "@courselit/common-models";
import { checkPermission } from "@courselit/utils";
import { MEDIA_MANAGER_PAGE_HEADING } from "@ui-config/strings";
import { useContext } from "react";

const { permissions } = UIConstants;

const breadcrumbs = [{ label: MEDIA_MANAGER_PAGE_HEADING, href: "#" }];

export default function Page() {
    const { profile } = useContext(ProfileContext);

    if (!profile) {
        return <LoadingScreen />;
    }

    if (
        !checkPermission(profile.permissions ?? [], [permissions.manageMedia])
    ) {
        return <LoadingScreen />;
    }

    return (
        <DashboardContent breadcrumbs={breadcrumbs}>
            <MediaLibrary />
        </DashboardContent>
    );
}
