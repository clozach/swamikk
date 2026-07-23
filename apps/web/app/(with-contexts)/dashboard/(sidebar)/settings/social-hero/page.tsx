"use client";

import { useContext } from "react";
import LoadingScreen from "@components/admin/loading-screen";
import { checkPermission } from "@courselit/utils";
import { AddressContext, ProfileContext } from "@components/contexts";
import { UIConstants } from "@courselit/common-models";
import DashboardContent from "@components/admin/dashboard-content";
import {
    SITE_SETTINGS_PAGE_HEADING,
    SITE_MISCELLANEOUS_SETTING_HEADER,
    SOCIAL_HERO_SETTINGS_HEADER,
} from "@ui-config/strings";
import dynamic from "next/dynamic";
const { permissions } = UIConstants;

const SocialHeroSettings = dynamic(
    () => import("@/components/admin/settings/social-hero"),
);

const breadcrumbs = [
    {
        label: SITE_SETTINGS_PAGE_HEADING,
        href: `/dashboard/settings?tab=${SITE_MISCELLANEOUS_SETTING_HEADER}`,
    },
    { label: SOCIAL_HERO_SETTINGS_HEADER, href: "#" },
];

export default function Page() {
    const address = useContext(AddressContext);
    const { profile } = useContext(ProfileContext);

    if (
        !profile ||
        !checkPermission(profile.permissions!, [permissions.manageSettings])
    ) {
        return <LoadingScreen />;
    }

    return (
        <DashboardContent breadcrumbs={breadcrumbs}>
            <SocialHeroSettings address={address} />
        </DashboardContent>
    );
}
