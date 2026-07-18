"use client";

import DashboardContent from "@components/admin/dashboard-content";
import LoadingScreen from "@components/admin/loading-screen";
import MediaLibrary from "@components/admin/media/media-library";
import { ProfileContext } from "@components/contexts";
import { UIConstants } from "@courselit/common-models";
import { checkPermission } from "@courselit/utils";
import { MEDIA_MANAGER_PAGE_HEADING } from "@ui-config/strings";
import { ADMIN_PERMISSIONS } from "@ui-config/constants";
import { useRouter } from "next/navigation";
import { useContext, useEffect } from "react";

const { permissions } = UIConstants;

const breadcrumbs = [{ label: MEDIA_MANAGER_PAGE_HEADING, href: "#" }];

export default function Page() {
    const { profile } = useContext(ProfileContext);
    const router = useRouter();

    // manageMedia alone is not enough: every signup gets it (so members can
    // attach images to community posts), and this page lists the whole
    // school's uploads, not the viewer's own. It needs an admin permission too.
    const allowed =
        !!profile &&
        checkPermission(profile.permissions ?? [], [permissions.manageMedia]) &&
        checkPermission(profile.permissions ?? [], ADMIN_PERMISSIONS);

    // Send a member somewhere real rather than parking them on a page that
    // never resolves. Refusing access is right; refusing it as a permanent
    // spinner is just a dead end wearing a loading state.
    useEffect(() => {
        if (profile && !allowed) {
            router.replace("/dashboard/my-content");
        }
    }, [profile, allowed, router]);

    if (!profile || !allowed) {
        return <LoadingScreen />;
    }

    return (
        <DashboardContent breadcrumbs={breadcrumbs}>
            <MediaLibrary />
        </DashboardContent>
    );
}
