import { headers } from "next/headers";
import type { Metadata } from "next";
import { getFullSiteSetup } from "@ui-lib/utils";
import { getAddressFromHeaders } from "@/app/actions";
import StatusScreen from "@components/status-screen";
import {
    NOT_FOUND_DESCRIPTION,
    NOT_FOUND_TITLE,
    PAGE_TITLE_404,
} from "@ui-config/strings";

export const metadata: Metadata = {
    title: PAGE_TITLE_404,
};

/**
 * The catch-all 404 for any URL that matches no route.
 *
 * Next.js renders this one inside the ROOT layout only — no route group, so
 * neither the storefront shell nor the context providers are available. It
 * therefore resolves the theme directly and hands it to the shared
 * {@link StatusScreen}, which is the same layout an in-app auth failure shows
 * (see `require-permission.tsx`) — one dead-end screen, two entry points.
 * After 5s it quietly returns the visitor to the site root; the logo and Home
 * button are the immediate way out.
 */
export default async function NotFound() {
    const address = await getAddressFromHeaders(headers);
    const siteSetup = await getFullSiteSetup(address);

    return (
        <StatusScreen
            code="404"
            title={NOT_FOUND_TITLE}
            description={NOT_FOUND_DESCRIPTION}
            theme={siteSetup?.theme?.theme}
            logo={siteSetup?.settings?.logo?.file}
            siteTitle={siteSetup?.settings?.title || ""}
            redirectTo="/"
            redirectSeconds={5}
            showProductsAction
        />
    );
}
