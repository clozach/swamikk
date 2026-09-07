import LayoutWithContext from "./layout-with-context";
import MediaDebugOverlay from "@components/public/media-debug-overlay";
import ContextualFeedback from "@components/feedback";
import React from "react";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { getFullSiteSetup } from "@ui-lib/utils";
import { getAddressFromHeaders } from "@/app/actions";
import { defaultState } from "@components/default-state";
import { decode } from "base-64";
import { ServerConfig, SiteInfo } from "@courselit/common-models";
import constants from "@config/constants";
import MemberMimicProvider from "@components/member-mimic/provider";
import { HideDuringMimic } from "@components/member-mimic/context";
import { requestContext } from "@/services/content-changes/http";
import { resolveMemberReadContext } from "@/services/member-mimic/context";
import {
    hasMemberMimicCookie,
    isMemberMimicPath,
    MEMBER_MIMIC_PATH_HEADER,
} from "@/services/member-mimic/constants";
import { NextRequest } from "next/server";
import type { MemberMimicView } from "@courselit/common-models";

export default async function Layout({
    children,
}: {
    children: React.ReactNode;
}) {
    const address = await getAddressFromHeaders(headers);
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    const siteSetup = await getFullSiteSetup(address);
    const requestHeaders = await headers();
    let mimicView: MemberMimicView = { kind: "inactive" };
    if (hasMemberMimicCookie(requestHeaders)) {
        try {
            const req = new NextRequest(address, { headers: requestHeaders });
            mimicView = (
                await resolveMemberReadContext(
                    requestHeaders,
                    await requestContext(req),
                )
            ).view;
        } catch {
            mimicView = { kind: "expired", returnTo: "/dashboard/users" };
        }
    }
    const config: ServerConfig = {
        turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "",
        queueServer: process.env.QUEUE_SERVER || "",
        cacheEnabled: constants.cacheEnabled,
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || "",
    };

    return (
        <LayoutWithContext
            address={address}
            siteinfo={formatSiteInfo(siteSetup?.settings)}
            theme={siteSetup?.theme || defaultState.theme}
            config={config}
            session={session}
            features={siteSetup?.features || defaultState.features}
        >
            <MemberMimicProvider initialView={mimicView}>
                {mimicView.kind === "inactive" ||
                (mimicView.kind === "active" &&
                    isMemberMimicPath(
                        requestHeaders.get(MEMBER_MIMIC_PATH_HEADER) || "",
                    ))
                    ? children
                    : null}
                <HideDuringMimic>
                    <MediaDebugOverlay />
                    <ContextualFeedback />
                </HideDuringMimic>
            </MemberMimicProvider>
        </LayoutWithContext>
    );
}

const formatSiteInfo = (siteinfo?: SiteInfo) => ({
    title: siteinfo?.title || defaultState.siteinfo.title,
    subtitle: siteinfo?.subtitle || defaultState.siteinfo.subtitle,
    logo: siteinfo?.logo || defaultState.siteinfo.logo,
    currencyISOCode:
        siteinfo?.currencyISOCode || defaultState.siteinfo.currencyISOCode,
    paymentMethod:
        siteinfo?.paymentMethod || defaultState.siteinfo.paymentMethod,
    stripeKey: siteinfo?.stripeKey || defaultState.siteinfo.stripeKey,
    codeInjectionHead: siteinfo?.codeInjectionHead
        ? decode(siteinfo.codeInjectionHead)
        : defaultState.siteinfo.codeInjectionHead,
    codeInjectionBody: siteinfo?.codeInjectionBody
        ? decode(siteinfo.codeInjectionBody)
        : defaultState.siteinfo.codeInjectionBody,
    mailingAddress:
        siteinfo?.mailingAddress || defaultState.siteinfo.mailingAddress,
    hideCourseLitBranding:
        siteinfo?.hideCourseLitBranding ||
        defaultState.siteinfo.hideCourseLitBranding,
    razorpayKey: siteinfo?.razorpayKey || defaultState.siteinfo.razorpayKey,
    lemonsqueezyKey:
        siteinfo?.lemonsqueezyKey || defaultState.siteinfo.lemonsqueezyKey,
    logins: siteinfo?.logins || defaultState.siteinfo.logins,
});
