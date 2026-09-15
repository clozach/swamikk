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
import { memberEditUi, memberMimicUi as copy } from "@/config/strings";
import { isMemberMimicPath } from "@/services/member-mimic/constants";
import { Shortcut } from "@/components/feedback/shortcut";
import { MemberMimicContext, announceMemberMimicChange } from "./context";
import MemberEditPanel, { type MemberEditPanelHandle } from "./edit/panel";
import "./member-mimic.css";

const isTyping = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !!target.closest(
        "input,textarea,select,[contenteditable=true],[contenteditable=plaintext-only]",
    );
const inDialog = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest("[role=dialog]");
const dialogOpen = () =>
    !!document.querySelector('[role="dialog"]:not([data-state="closed"])');

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
    const [editOpen, setEditOpen] = useState(false);
    const [appliedVersion, setAppliedVersion] = useState(0);
    const current = useRef(view);
    const path = usePathname() || "/";
    current.current = view;
    const panel = useRef<MemberEditPanelHandle>(null);
    const editToggle = useRef<HTMLButtonElement>(null);
    const editOpenRef = useRef(editOpen);
    editOpenRef.current = editOpen;
    // A saved record needs a fresh background page once drafts are safe.
    const editApplied = useRef(false);

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

    const openEdit = useCallback(() => {
        setEditOpen(true);
    }, []);

    /**
     * Closing the panel. The pages behind it hold what they show in client
     * state read once on mount — the profile page's name comes from its own
     * getUser fetch (useState), its email from ProfileContext, and the contact
     * preferences card from its own /api/contact-preferences fetch — so a
     * router.refresh() after a save leaves them showing the old values. A
     * full reload after an applied edit is the one way the page reflects the
     * record; it waits until nothing typed would be lost.
     */
    const closeEdit = useCallback(() => {
        if (!editOpenRef.current) return;
        const active = document.activeElement;
        if (
            active instanceof HTMLElement &&
            active.closest("[data-kk-member-edit]")
        )
            editToggle.current?.focus();
        setEditOpen(false);
    }, []);

    useEffect(() => {
        if (
            phase === "ready" &&
            !editOpen &&
            editApplied.current &&
            !panel.current?.isDirty()
        ) {
            editApplied.current = false;
            // After the click's own default action (a followed link wins).
            window.setTimeout(() => window.location.reload(), 0);
        }
    }, [editOpen, appliedVersion, phase]);

    const toggleEdit = useCallback(() => {
        if (editOpenRef.current) closeEdit();
        else openEdit();
    }, [closeEdit, openEdit]);

    // Global keys while the view is active: ⌥⌘E toggles the panel; while it is
    // open, Escape ladders out one level (a dialog closes itself first) and
    // ⌘Z / ⇧⌘Z reverse the last edit unless the keyboard is in a field.
    useEffect(() => {
        if (view.kind !== "active") return;
        const keydown = (event: KeyboardEvent) => {
            if (
                (event.metaKey || event.ctrlKey) &&
                event.altKey &&
                event.code === "KeyE"
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (event.repeat) return;
                toggleEdit();
                return;
            }
            if (!editOpenRef.current) return;
            if (event.key === "Escape") {
                if (inDialog(event.target)) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                closeEdit();
                return;
            }
            if (isTyping(event.target) || inDialog(event.target)) return;
            if (
                (event.metaKey || event.ctrlKey) &&
                !event.altKey &&
                event.code === "KeyZ"
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (event.repeat) return;
                if (event.shiftKey) panel.current?.redo();
                else panel.current?.undo();
            }
        };
        window.addEventListener("keydown", keydown, true);
        return () => window.removeEventListener("keydown", keydown, true);
    }, [closeEdit, toggleEdit, view.kind]);

    // A click anywhere outside the panel and the banner closes the panel; a
    // click inside an open dialog (History) belongs to the dialog.
    useEffect(() => {
        if (!editOpen) return;
        const click = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (
                target.closest(
                    "[data-kk-member-edit], [data-member-mimic-tools], [role=dialog]",
                ) ||
                dialogOpen()
            )
                return;
            closeEdit();
        };
        document.addEventListener("click", click, true);
        return () => document.removeEventListener("click", click, true);
    }, [closeEdit, editOpen]);

    async function exit(redirectTo?: string) {
        setPhase("leaving");
        setNotice("");
        setEditOpen(false);
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
            window.location.replace(
                redirectTo || result.redirectTo || "/dashboard/users",
            );
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
                        <div className="kk-mimic-banner-tools">
                            {view.kind === "active" && (
                                <button
                                    ref={editToggle}
                                    type="button"
                                    data-kk-member-edit-toggle
                                    aria-keyshortcuts="Alt+Meta+E"
                                    aria-expanded={editOpen}
                                    title={memberEditUi.openTitle}
                                    disabled={phase === "leaving"}
                                    onClick={toggleEdit}
                                >
                                    {memberEditUi.open}{" "}
                                    <Shortcut>
                                        {memberEditUi.openShortcut}
                                    </Shortcut>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => void exit()}
                                disabled={phase === "leaving"}
                            >
                                {phase === "leaving" ? copy.exiting : copy.exit}
                            </button>
                        </div>
                    </aside>
                    {view.kind === "active" && (
                        <MemberEditPanel
                            key={view.subject.userId}
                            ref={panel}
                            open={editOpen}
                            subjectName={view.subject.name}
                            onClose={closeEdit}
                            onExit={(redirectTo) => void exit(redirectTo)}
                            onApplied={() => {
                                editApplied.current = true;
                                setAppliedVersion((version) => version + 1);
                                void verify();
                            }}
                        />
                    )}
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
