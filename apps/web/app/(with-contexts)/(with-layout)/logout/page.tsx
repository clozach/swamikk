"use client";

import { Section, Text1, Button } from "@courselit/page-primitives";
import { LOGOUT, LOGOUT_MESSAGE } from "@ui-config/strings";
import { useContext } from "react";
import type { FormEvent } from "react";
import { ThemeContext } from "@components/contexts";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@courselit/components-library";

export default function ClientSide() {
    const { theme } = useContext(ThemeContext);
    const { toast } = useToast();

    const handleLogout = async (event: FormEvent) => {
        // With JS we handle sign-out ourselves (better error surfacing); the
        // form's native POST to /api/logout is the no-JS fallback, so cancel it
        // here. Either path clears the session and lands on the home page — not
        // a login screen. This page is the dashboard's logout control (a
        // protected area you can't stay on once signed out), so leaving to "/"
        // is the "page is no longer auth'd → go home" path. The public header
        // signs out in place instead (see account-control).
        event.preventDefault();
        const { error } = await authClient.signOut({
            fetchOptions: {
                onSuccess: () => {
                    window.location.href = "/";
                },
            },
        });

        if (error) {
            toast({
                title: "Error",
                description: error?.message,
                variant: "destructive",
            });
        }
    };

    return (
        <Section theme={theme.theme}>
            <div className="flex flex-col gap-4">
                <Text1 theme={theme.theme}>{LOGOUT_MESSAGE}</Text1>
                {/* A real form so logout works without JavaScript: no-JS posts
                    natively to /api/logout (clears the session, 303s home); with
                    JS, handleLogout intercepts for in-app sign-out + error toast. */}
                <form
                    method="post"
                    action="/api/logout"
                    onSubmit={handleLogout}
                >
                    <Button theme={theme.theme} type="submit">
                        {LOGOUT}
                    </Button>
                </form>
            </div>
        </Section>
    );
}
