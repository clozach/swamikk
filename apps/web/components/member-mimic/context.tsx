"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MemberMimicView } from "@courselit/common-models";

export const MemberMimicContext = createContext<MemberMimicView>({
    kind: "inactive",
});
export const useMemberMimic = () => useContext(MemberMimicContext);

export function HideDuringMimic({ children }: { children: ReactNode }) {
    return useMemberMimic().kind === "inactive" ? children : null;
}

export function announceMemberMimicChange() {
    try {
        const channel = new BroadcastChannel("courselit-member-mimic");
        channel.postMessage("changed");
        channel.close();
    } catch {
        /* Focus/pageshow verification remains available. */
    }
    try {
        localStorage.setItem(
            "courselit-member-mimic-change",
            String(Date.now()),
        );
    } catch {
        /* No member identity or token is stored in browser storage. */
    }
}
