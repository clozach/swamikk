"use client";

import { useContext } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { Image } from "@courselit/components-library";
import { usePrivatePalette } from "@/lib/use-private-palette";
import { cn } from "@/lib/shadcn-utils";
import { ProfileContext, SiteInfoContext } from "@components/contexts";
import { Button } from "@components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@components/ui/tooltip";
import NextThemeSwitcher from "@components/admin/next-theme-switcher";
import {
    BTN_EXIT_COURSE_TOOLTIP,
    PREVIEW_COURSE_MENU_ITEM,
} from "@ui-config/strings";
import {
    getCourseViewerReturnPath,
    getCourseViewerSessionParams,
} from "@/lib/course-viewer-session-params";
import { CourseFrontend } from "./helpers";

/**
 * Chrome for download-type products: a store-bought virtual good needs none
 * of the course apparatus, so there is no sidebar, no lesson list, and no
 * intro/lesson split — just the site identity on the left and the same
 * theme-switcher + exit controls the course viewer's top bar has on the
 * right. The content (player, download, description) is the page itself.
 */
export default function LeanDownloadLayout({
    product,
    children,
}: {
    product: CourseFrontend;
    children: React.ReactNode;
}) {
    const { profile } = useContext(ProfileContext);
    const siteinfo = useContext(SiteInfoContext);
    const privatePalette = usePrivatePalette();
    const searchParams = useSearchParams();
    const viewerSessionParams = getCourseViewerSessionParams(searchParams);
    const exitPath = getCourseViewerReturnPath(viewerSessionParams.returnTo);
    const hasSession = Boolean(profile?.userId);

    return (
        <TooltipProvider>
            <div
                className={cn(
                    "courselit-theme flex min-h-svh flex-col bg-background text-foreground",
                    privatePalette,
                )}
            >
                <header className="flex h-16 shrink-0 items-center justify-between px-4">
                    <Link
                        href="/dashboard/my-content"
                        className="flex items-center gap-2 font-semibold"
                    >
                        <div className="flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden">
                            <Image
                                borderRadius={1}
                                // Eager, not the wrapper's lazy default: the
                                // brand logo is always above the fold, and Safari
                                // intermittently never fires the lazy load for it
                                // (blank/broken until a repaint).
                                loading="eager"
                                src={siteinfo.logo?.file || ""}
                                alt="logo"
                                className="w-full h-full object-cover"
                            />
                        </div>
                        {siteinfo.title}
                    </Link>
                    <div className="flex items-center gap-2">
                        {product.isPreview && (
                            <Badge variant="secondary">
                                {PREVIEW_COURSE_MENU_ITEM}
                            </Badge>
                        )}
                        <NextThemeSwitcher variant="ghost" />
                        {hasSession && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" asChild>
                                        <Link href={exitPath}>
                                            <LogOutIcon />
                                        </Link>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {BTN_EXIT_COURSE_TOOLTIP}
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                </header>
                <div className="flex flex-1 flex-col min-h-0 p-4">
                    {children}
                </div>
            </div>
        </TooltipProvider>
    );
}
