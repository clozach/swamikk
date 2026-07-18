import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { Header1, Text1, Button } from "@courselit/page-primitives";
import { getFullSiteSetup } from "@ui-lib/utils";
import { getAddressFromHeaders } from "@/app/actions";
import {
    NOT_FOUND_ACTION_HOME,
    NOT_FOUND_ACTION_PRODUCTS,
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
 * Next.js renders this one inside the ROOT layout only — it gets no route
 * group, so neither the storefront's header/footer nor the context providers
 * are available here. It therefore reaches for the site's theme directly and
 * carries the `courselit-theme` class itself, which is what the storefront
 * shell and the course player each do for the same reason.
 *
 * The site logo doubles as the way out, so a visitor who landed here from a
 * stale link is never more than one click from somewhere real.
 */
export default async function NotFound() {
    const address = await getAddressFromHeaders(headers);
    const siteSetup = await getFullSiteSetup(address);
    const theme = siteSetup?.theme?.theme;
    const logo = siteSetup?.settings?.logo?.file;
    const title = siteSetup?.settings?.title || "";

    return (
        <div className="courselit-theme flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16 text-center">
            {logo ? (
                <Link href="/" className="mb-10 inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={logo}
                        alt={title}
                        className="mx-auto h-auto max-h-20 w-auto max-w-[280px] object-contain"
                    />
                </Link>
            ) : null}
            <Header1 theme={theme} className="text-foreground">
                {NOT_FOUND_TITLE}
            </Header1>
            <div className="mt-4 max-w-prose">
                <Text1 theme={theme} className="text-muted-foreground">
                    {NOT_FOUND_DESCRIPTION}
                </Text1>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <Link href="/">
                    <Button theme={theme}>{NOT_FOUND_ACTION_HOME}</Button>
                </Link>
                <Link href="/products">
                    <Button theme={theme} variant="secondary">
                        {NOT_FOUND_ACTION_PRODUCTS}
                    </Button>
                </Link>
            </div>
        </div>
    );
}
