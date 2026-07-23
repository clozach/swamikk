"use client";

import { useContext } from "react";
import { AddressContext } from "@components/contexts";
import { UIConstants } from "@courselit/common-models";
import DashboardContent from "@components/admin/dashboard-content";
import RequirePermission from "@components/require-permission";
import {
    APIKEY_NEW_HEADER,
    SITE_MISCELLANEOUS_SETTING_HEADER,
    SITE_SETTINGS_PAGE_HEADING,
} from "@ui-config/strings";
import dynamic from "next/dynamic";
const { permissions } = UIConstants;

const ApikeyNew = dynamic(
    () => import("@/components/admin/settings/apikey/new"),
);

const breadcrumbs = [
    {
        label: SITE_SETTINGS_PAGE_HEADING,
        href: `/dashboard/settings?tab=${SITE_MISCELLANEOUS_SETTING_HEADER}`,
    },
    { label: APIKEY_NEW_HEADER, href: "#" },
];

export default function Page() {
    const address = useContext(AddressContext);

    return (
        <RequirePermission permissions={[permissions.manageSettings]}>
            <DashboardContent breadcrumbs={breadcrumbs}>
                <ApikeyNew address={address} />
            </DashboardContent>
        </RequirePermission>
    );
}
