import HomepageLayout from "./home-page-layout";
import { headers } from "next/headers";
import { getFullSiteSetup } from "@ui-lib/utils";
import { getAddressFromHeaders } from "@/app/actions";
import { SiteUnavailable } from "./site-unavailable";

export default async function Layout({
    children,
}: {
    children: React.ReactNode;
}) {
    const address = await getAddressFromHeaders(headers);
    const siteInfo = await getFullSiteSetup(address);

    if (!siteInfo) {
        return <SiteUnavailable />;
    }

    return <HomepageLayout siteInfo={siteInfo}>{children}</HomepageLayout>;
}
