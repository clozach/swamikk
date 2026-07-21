"use client";

import { useContext } from "react";
import {
    AddressContext,
    ServerConfigContext,
    TypefacesContext,
} from "@components/contexts";
import { ProfileContext } from "@components/contexts";
import BaseLayout from "@components/public/base-layout";
import { isStructuralWidget } from "@components/public/base-layout/template/widget-roles";
import { Profile } from "@courselit/common-models";
import CompareTool from "@components/public/compare-tool/compare-tool";

export default function ClientSidePage({
    page,
    siteinfo,
    theme,
}: {
    page;
    siteinfo;
    theme;
}) {
    const typefaces = useContext(TypefacesContext);
    const config = useContext(ServerConfigContext);
    const { profile } = useContext(ProfileContext);
    const address = useContext(AddressContext);

    if (!page) {
        return null;
    }

    const layoutWithoutHeaderFooter = page?.layout
        ?.filter((layout: any) => !isStructuralWidget(layout.name))
        ?.map((layout: any) => ({
            ...layout,
            settings: layout.settings || {},
        }));

    // Easter egg only on pages that actually carry a compare tool — i.e. a
    // page built with the editorial-resilience block (the Building Resilience
    // page). Keyed off block presence, so it survives slug/clone changes.
    const hasCompareTool = page?.layout?.some(
        (layout: any) => layout.name === "editorialResilience",
    );

    return (
        <>
            <BaseLayout
                layout={layoutWithoutHeaderFooter}
                title={page.title || page.pageData?.title}
                pageData={page.pageData}
                siteInfo={siteinfo}
                theme={theme}
                state={{
                    config: config,
                    siteinfo,
                    address,
                    profile: profile as Profile,
                    auth: profile?.email
                        ? {
                              guest: false,
                              checked: true,
                          }
                        : {
                              guest: true,
                              checked: true,
                          },
                    networkAction: false,
                    theme,
                    typefaces,
                    message: {
                        message: "",
                        open: false,
                        action: null,
                    },
                }}
            />
            {hasCompareTool && <CompareTool context="resilience" />}
        </>
    );
}
