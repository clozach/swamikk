"use client";

import { ReactNode, useContext } from "react";
import { checkPermission } from "@courselit/utils";
import {
    ProfileContext,
    SiteInfoContext,
    ThemeContext,
} from "@components/contexts";
import LoadingScreen from "@components/admin/loading-screen";
import StatusScreen from "@components/status-screen";
import {
    ACCESS_DENIED_DESCRIPTION,
    ACCESS_DENIED_TITLE,
} from "@ui-config/strings";

/**
 * Gate a dashboard page on permission WITHOUT the infinite-skeleton trap.
 *
 * The old pattern — `if (!profile || !checkPermission(...)) return
 * <LoadingScreen/>` — conflated "profile still loading" with "loaded but
 * unauthorized", so an authenticated user lacking the permission stared at a
 * pulsing skeleton forever. Here the two are distinct:
 *   - not fetched yet  → LoadingScreen (genuinely transient);
 *   - fetched + denied → a 403 StatusScreen that auto-returns home in 5s
 *     (a permission denial is a 403, not a 500 — it isn't a server error);
 *   - fetched + allowed → the page.
 */
export default function RequirePermission({
    permissions,
    children,
}: {
    permissions: string[];
    children: ReactNode;
}) {
    const { profile } = useContext(ProfileContext);
    const { theme } = useContext(ThemeContext);
    const siteinfo = useContext(SiteInfoContext);

    if (!profile?.fetched) {
        return <LoadingScreen />;
    }

    if (!checkPermission(profile.permissions ?? [], permissions)) {
        return (
            <StatusScreen
                code="403"
                title={ACCESS_DENIED_TITLE}
                description={ACCESS_DENIED_DESCRIPTION}
                theme={theme?.theme}
                logo={siteinfo?.logo?.file}
                siteTitle={siteinfo?.title}
                redirectTo="/"
                redirectSeconds={5}
            />
        );
    }

    return <>{children}</>;
}
