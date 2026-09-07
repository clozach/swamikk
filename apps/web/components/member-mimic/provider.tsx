"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { MemberMimicView } from "@courselit/common-models";
import { memberMimicUi as copy } from "@/config/strings";
import { isMemberMimicPath } from "@/services/member-mimic/constants";
import { MemberMimicContext, announceMemberMimicChange } from "./context";
import "./member-mimic.css";

export default function MemberMimicProvider({
    initialView,
    children,
}: {
    initialView: MemberMimicView;
    children: ReactNode;
}) {
    const [view, setView] = useState(initialView);
    const [phase, setPhase] = useState<
        "verifying" | "ready" | "unavailable" | "leaving"
    >("verifying");
    const [notice, setNotice] = useState("");
    const current = useRef(view);
    const path = usePathname() || "/";
    current.current = view;

    const verify = useCallback(async (hide = false) => {
        if (hide) setPhase("verifying");
        try {
            const response = await fetch("/api/member-mimic", {
                cache: "no-store",
                credentials: "same-origin",
            });
            if (!response.ok) throw new Error();
            const result = await response.json();
            const next: MemberMimicView = result.mimic;
            if (
                next.kind === "inactive" &&
                current.current.kind !== "inactive"
            ) {
                const returnTo = current.current.returnTo;
                setPhase("leaving");
                window.location.replace(returnTo);
                return;
            }
            if (
                next.kind === "active" &&
                (current.current.kind !== "active" ||
                    current.current.subject.userId !== next.subject.userId)
            ) {
                setPhase("leaving");
                window.location.replace("/dashboard/profile");
                return;
            }
            setView(next);
            setPhase("ready");
            delete document.documentElement.dataset.memberMimicSuspended;
        } catch {
            setPhase("unavailable");
        }
    }, []);

    useEffect(() => {
        void verify(true);
        const pagehide = () => {
            if (current.current.kind !== "inactive")
                document.documentElement.dataset.memberMimicSuspended = "true";
        };
        const pageshow = (event: PageTransitionEvent) => {
            if (event.persisted) void verify(true);
        };
        const focus = () => {
            void verify(current.current.kind !== "inactive");
        };
        const storage = (event: StorageEvent) => {
            if (event.key === "courselit-member-mimic-change")
                void verify(true);
        };
        let channel: BroadcastChannel | undefined;
        try {
            channel = new BroadcastChannel("courselit-member-mimic");
            channel.onmessage = () => {
                void verify(true);
            };
        } catch {
            /* Storage/focus fallback. */
        }
        window.addEventListener("pagehide", pagehide);
        window.addEventListener("pageshow", pageshow);
        window.addEventListener("focus", focus);
        window.addEventListener("storage", storage);
        return () => {
            window.removeEventListener("pagehide", pagehide);
            window.removeEventListener("pageshow", pageshow);
            window.removeEventListener("focus", focus);
            window.removeEventListener("storage", storage);
            channel?.close();
        };
    }, [verify]);

    useEffect(() => {
        if (view.kind !== "active") return;
        const timeout = window.setTimeout(
            () => setView({ kind: "expired", returnTo: view.returnTo }),
            Math.max(0, Date.parse(view.expiresAt) - Date.now()),
        );
        const followLink = (event: MouseEvent) => {
            const anchor = (event.target as Element)?.closest?.(
                "a[href]",
            ) as HTMLAnchorElement | null;
            if (!anchor || anchor.closest("[data-member-mimic-tools]")) return;
            try {
                const url = new URL(anchor.href, window.location.href);
                if (
                    url.origin !== window.location.origin ||
                    !isMemberMimicPath(url.pathname)
                ) {
                    event.preventDefault();
                    event.stopPropagation();
                    setNotice(copy.outsideHelp);
                }
            } catch {
                event.preventDefault();
            }
        };
        document.addEventListener("click", followLink, true);
        return () => {
            window.clearTimeout(timeout);
            document.removeEventListener("click", followLink, true);
        };
    }, [view]);

    async function exit() {
        setPhase("leaving");
        setNotice("");
        try {
            const response = await fetch("/api/member-mimic", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
            });
            if (!response.ok) throw new Error();
            const result = await response.json();
            document.documentElement.dataset.memberMimicSuspended = "true";
            announceMemberMimicChange();
            window.location.replace(result.redirectTo || "/dashboard/users");
        } catch {
            setNotice(copy.exitFailed);
            setPhase("ready");
        }
    }

    const enabled = view.kind !== "inactive";
    const blocked =
        enabled && (view.kind === "expired" || !isMemberMimicPath(path));
    return (
        <MemberMimicContext.Provider value={view}>
            {enabled && (
                <>
                    <div className="kk-mimic-watermark" aria-hidden="true" />
                    <aside
                        className="kk-mimic-banner"
                        data-member-mimic-tools
                        aria-label={copy.title}
                    >
                        <div>
                            <strong>{copy.title}</strong>
                            {view.kind === "active" && (
                                <span>
                                    {" "}
                                    · {copy.viewing}{" "}
                                    <strong>{view.subject.name}</strong>
                                    {view.subject.name !==
                                        view.subject.email && (
                                        <>
                                            {" "}
                                            <span className="kk-mimic-email">
                                                ({view.subject.email})
                                            </span>
                                        </>
                                    )}
                                </span>
                            )}
                            <small>{copy.readOnly}</small>
                        </div>
                        <button
                            type="button"
                            onClick={exit}
                            disabled={phase === "leaving"}
                        >
                            {phase === "leaving" ? copy.exiting : copy.exit}
                        </button>
                    </aside>
                </>
            )}
            {notice && enabled && (
                <p className="kk-mimic-notice" role="status">
                    {notice}
                </p>
            )}
            <div
                className={
                    enabled
                        ? "kk-mimic-content kk-mimic-spacing"
                        : "kk-mimic-content"
                }
            >
                {phase !== "ready" ? (
                    <main className="kk-mimic-block" role="status">
                        {copy.verifying}
                        {phase === "unavailable" && (
                            <button
                                className="ml-4 rounded border px-4 py-2"
                                onClick={() => void verify(true)}
                            >
                                {copy.retry}
                            </button>
                        )}
                    </main>
                ) : blocked ? (
                    <main className="kk-mimic-block">
                        <h1>
                            {view.kind === "expired"
                                ? copy.expired
                                : copy.outside}
                        </h1>
                        <p>
                            {view.kind === "expired"
                                ? copy.expiredHelp
                                : copy.outsideHelp}
                        </p>
                        {view.kind === "active" && (
                            <a
                                data-member-mimic-tools
                                href="/dashboard/profile"
                            >
                                {copy.profile}
                            </a>
                        )}
                    </main>
                ) : (
                    children
                )}
            </div>
            {enabled && !blocked && (
                <p className="kk-mimic-privacy" role="note">
                    {copy.privacy}
                </p>
            )}
        </MemberMimicContext.Provider>
    );
}
