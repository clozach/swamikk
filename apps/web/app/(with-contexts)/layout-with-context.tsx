"use client";

import {
    ReactNode,
    useEffect,
    useState,
    Suspense,
    useCallback,
    startTransition,
} from "react";
import { SiteInfo, ServerConfig, Features } from "@courselit/common-models";
import {
    AddressContext,
    ProfileContext,
    SiteInfoContext,
    ServerConfigContext,
    ThemeContext,
    FeaturesContext,
} from "@components/contexts";
import { Toaster, useToast } from "@courselit/components-library";
import { TOAST_TITLE_ERROR } from "@ui-config/strings";
import { Theme } from "@courselit/page-models";
import { ThemeProvider as NextThemesProvider } from "@components/next-theme-provider";
import { defaultState } from "@components/default-state";
import { getUserProfile } from "./helpers";
import { auth } from "@/auth";

type BetterAuthSession = Awaited<ReturnType<typeof auth.api.getSession>> | null;

function LayoutContent({
    address,
    children,
    siteinfo,
    theme: initialTheme,
    config,
    session,
    features,
}: {
    address: string;
    children: ReactNode;
    siteinfo: SiteInfo;
    theme: Theme;
    config: ServerConfig;
    session: BetterAuthSession;
    features: Features[];
}) {
    const [profile, setProfile] = useState(defaultState.profile);
    const [theme, setTheme] = useState(initialTheme);
    const { toast } = useToast();

    const updateUserProfile = useCallback(async () => {
        try {
            const fetchedProfile = await getUserProfile(address);
            if (fetchedProfile) {
                setProfile(fetchedProfile);
            }
        } catch (err) {
            setProfile((currentProfile) => ({
                ...currentProfile,
                fetched: true,
            }));
            const message =
                err instanceof Error ? err.message : "Unknown error occurred";
            toast({
                title: TOAST_TITLE_ERROR,
                description: message,
                variant: "destructive",
            });
        }
    }, [address, toast]);

    useEffect(() => {
        if (address && session) {
            startTransition(() => {
                void updateUserProfile();
            });
        } else if (address && !session) {
            // No session (signed out, or never signed in): reset the client
            // profile to a guest so consumers reading ProfileContext flip to
            // their signed-out state. Without this, an in-place sign-out
            // (fetch + router.refresh, as the anahata header does) would re-run
            // this effect with session=null but leave the stale signed-in
            // profile in state — the header would keep showing the avatar until
            // a full navigation. A hard-reload logout hid this because remount
            // starts from defaultState; a soft refresh does not.
            startTransition(() => {
                setProfile({ ...defaultState.profile, fetched: true });
            });
        }
    }, [address, session, updateUserProfile]);

    if (session && !profile.fetched) {
        return null;
    }

    return (
        <AddressContext.Provider
            value={{
                backend: address,
                frontend: address,
            }}
        >
            <FeaturesContext.Provider value={features}>
                <SiteInfoContext.Provider value={siteinfo}>
                    <ThemeContext.Provider value={{ theme, setTheme }}>
                        <ServerConfigContext.Provider value={config}>
                            <NextThemesProvider
                                attribute="class"
                                defaultTheme="system"
                                enableSystem
                                disableTransitionOnChange
                            >
                                <ProfileContext.Provider
                                    value={{ profile, setProfile }}
                                >
                                    <Suspense fallback={null}>
                                        {children}
                                    </Suspense>
                                </ProfileContext.Provider>
                            </NextThemesProvider>
                        </ServerConfigContext.Provider>
                    </ThemeContext.Provider>
                </SiteInfoContext.Provider>
                <Toaster />
            </FeaturesContext.Provider>
        </AddressContext.Provider>
    );
}

export default function Layout(props: {
    address: string;
    children: ReactNode;
    siteinfo: SiteInfo;
    theme: Theme;
    config: ServerConfig;
    session: BetterAuthSession;
    features: Features[];
}) {
    return (
        <Suspense fallback={null}>
            <LayoutContent {...props} />
        </Suspense>
    );
}
