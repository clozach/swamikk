"use client";

import { useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ProfileContext } from "@/components/contexts";
import { UIConstants } from "@courselit/common-models";
import { useMemberMimic } from "./context";
import { safeMimicReturnTo } from "@/services/member-mimic/constants";

/** All member tables enter the same server-authorized, read-only member view. */
export default function MemberMimicLink({
    userId,
    children,
    className = "underline underline-offset-4",
    returnTo,
}: {
    userId?: string | null;
    children: ReactNode;
    className?: string;
    returnTo?: string;
}) {
    const { profile } = useContext(ProfileContext);
    const mimic = useMemberMimic();
    const path = usePathname();
    if (
        !userId ||
        mimic.kind !== "inactive" ||
        !profile?.permissions?.includes(UIConstants.permissions.manageUsers)
    )
        return <>{children}</>;

    const href = (source: string) =>
        `/dashboard/users/${encodeURIComponent(userId)}?${new URLSearchParams({
            returnTo: safeMimicReturnTo(source),
        })}`;
    return (
        <a
            className={className}
            href={href(returnTo || path)}
            onClick={(event) => {
                // Preserve query state for normal and modified/new-tab clicks.
                event.currentTarget.href = href(
                    returnTo ||
                        window.location.pathname + window.location.search,
                );
            }}
        >
            {children}
        </a>
    );
}
