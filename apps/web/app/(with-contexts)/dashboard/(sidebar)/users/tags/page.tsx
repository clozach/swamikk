"use client";

import DashboardContent from "@components/admin/dashboard-content";
import RequirePermission from "@components/require-permission";
import Tags from "@components/admin/users/tags";
import { AddressContext } from "@components/contexts";
import { UIConstants } from "@courselit/common-models";
import {
    USERS_MANAGER_PAGE_HEADING,
    USERS_TAG_HEADER,
} from "@ui-config/strings";
import { useContext } from "react";

const { permissions } = UIConstants;

const breadcrumbs = [
    {
        label: USERS_MANAGER_PAGE_HEADING,
        href: "/dashboard/users",
    },
    {
        label: USERS_TAG_HEADER,
        href: "#",
    },
];

export default function Page() {
    const address = useContext(AddressContext);

    return (
        <RequirePermission permissions={[permissions.manageUsers]}>
            <DashboardContent breadcrumbs={breadcrumbs}>
                <Tags address={address} />
            </DashboardContent>
        </RequirePermission>
    );
}
