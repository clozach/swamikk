"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Redo2, ShieldCheck, Undo2 } from "lucide-react";
import type { Address, User } from "@courselit/common-models";
import { permissionsUi as copy } from "@config/strings";
import { Button } from "@/components/ui/button";
import { SelectionTools } from "@/components/feedback/selection-tools";
import { Shortcut } from "@/components/feedback/shortcut";
import type { TargetBounds } from "@/components/feedback/magnet-placement";
import { useVisualViewport } from "@/components/feedback/viewport";
import PermissionsEditor from "./permissions-editor";
import permissionToCaptionMap from "./permissions-to-caption-map";
import { changedPermission, savePermissions } from "./use-permissions";
import "./permissions-magnet.css";

/** What the panel last did, shown where the click happened until the next act. */
type Status =
    | { kind: "idle" }
    | { kind: "changed"; permission: string; on: boolean }
    | { kind: "failed"; message: string };

const isTyping = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !!target.closest("input,textarea,select,[contenteditable=true]");

/** The row's rectangle, kept current through scrolling, resizing and reflow. */
function useElementBounds(element: HTMLElement | null) {
    const [bounds, setBounds] = useState<TargetBounds | null>(null);
    const viewport = useVisualViewport();
    useEffect(() => {
        if (!element) return;
        const update = () => {
            const rect = element.getBoundingClientRect();
            setBounds({
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
            });
        };
        const frame = window.requestAnimationFrame(update);
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        const observer =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(update);
        observer?.observe(element);
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener("scroll", update, true);
            window.removeEventListener("resize", update);
            observer?.disconnect();
        };
    }, [element, viewport]);
    return element ? bounds : null;
}

/**
 * The magnet beside a selected account in the Users list. Closed, it offers
 * the two things an admin does with an account from here — change its
 * permissions, or view the site as that member — each with its chord. Open, it
 * is the permissions panel itself, grown in place: nine boxes that save at
 * once, a way back beside the change (Undo ⌘Z), and the row still in view.
 */
export default function PermissionsMagnet({
    user,
    rowElement,
    panel,
    address,
    selfUserId,
    mimicHref,
    onOpenPanel,
    onClosePanel,
    onSaved,
}: {
    user: User;
    rowElement: HTMLElement | null;
    /** True when the panel is open; false shows the two-button toolbar. */
    panel: boolean;
    address: Address;
    selfUserId?: string;
    /** Null for a restricted account, which has no member view. */
    mimicHref: string | null;
    onOpenPanel: () => void;
    onClosePanel: () => void;
    /** The server's list after a change; the list row updates from it. */
    onSaved: (permissions: string[]) => void;
}) {
    const bounds = useElementBounds(rowElement);
    const [pending, setPending] = useState<string | null>(null);
    const [protectedAccount, setProtectedAccount] = useState(false);
    const [status, setStatus] = useState<Status>({ kind: "idle" });
    const past = useRef<string[][]>([]);
    const future = useRef<string[][]>([]);
    const [stacks, setStacks] = useState({ undo: 0, redo: 0 });
    // The last list the server confirmed: the diff base for every save, kept
    // here so undo and redo stay right even before the list row re-renders.
    // (The magnet is keyed by account, so the prop only ever restates a save.)
    const [known, setKnown] = useState(user.permissions);
    const current = useRef(user.permissions);
    const self = selfUserId === user.userId;
    const locked = self || protectedAccount;
    const name = user.name || user.email;

    const commit = useCallback(
        async (next: string[], move: "do" | "undo" | "redo") => {
            const before = current.current;
            const permission = changedPermission(before, next);
            if (!permission) return;
            setPending(permission);
            setStatus({ kind: "idle" });
            const result = await savePermissions(address, user.userId, next);
            setPending(null);
            if (result.kind === "applied") {
                if (move === "do") {
                    past.current.push(before);
                    future.current = [];
                } else if (move === "undo") future.current.push(before);
                else past.current.push(before);
                setStacks({
                    undo: past.current.length,
                    redo: future.current.length,
                });
                current.current = result.permissions;
                setKnown(result.permissions);
                onSaved(result.permissions);
                setStatus({
                    kind: "changed",
                    permission,
                    on: result.permissions.includes(permission),
                });
            } else if (result.kind === "refused") {
                setProtectedAccount(true);
            } else {
                setStatus({
                    kind: "failed",
                    message: result.message || copy.failed,
                });
            }
        },
        [address, onSaved, user.userId],
    );
    const toggle = (permission: string, on: boolean) =>
        void commit(
            on
                ? [...current.current, permission]
                : current.current.filter((item) => item !== permission),
            "do",
        );
    const undo = useCallback(() => {
        const previous = past.current.pop();
        if (previous) void commit(previous, "undo");
    }, [commit]);
    const redo = useCallback(() => {
        const next = future.current.pop();
        if (next) void commit(next, "redo");
    }, [commit]);

    // ⌘Z / ⇧⌘Z reverse the last change while the panel is open.
    useEffect(() => {
        if (!panel) return;
        const keydown = (event: KeyboardEvent) => {
            if (
                !(event.metaKey || event.ctrlKey) ||
                event.altKey ||
                event.code !== "KeyZ" ||
                isTyping(event.target)
            )
                return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.shiftKey) redo();
            else undo();
        };
        window.addEventListener("keydown", keydown, { capture: true });
        return () =>
            window.removeEventListener("keydown", keydown, { capture: true });
    }, [panel, undo, redo]);

    // Opening the panel puts the keyboard on its first box.
    useEffect(() => {
        if (!panel) return;
        const frame = window.requestAnimationFrame(() => {
            document
                .querySelector<HTMLElement>(
                    "[data-kk-permissions-list] [role=checkbox]",
                )
                ?.focus();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [panel]);

    if (!bounds) return null;

    const line =
        status.kind === "changed"
            ? `${permissionToCaptionMap[status.permission]}: ${status.on ? copy.on : copy.off}`
            : status.kind === "failed"
              ? status.message
              : "";

    return (
        <SelectionTools
            target={bounds}
            label={panel ? `${copy.title} · ${name}` : name}
            role={panel ? "group" : "toolbar"}
        >
            {panel ? (
                <div className="kk-permissions-panel" data-kk-permissions>
                    <div className="kk-permissions-head">
                        <span>
                            <strong>{copy.title}</strong> · {name}
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-kk-permissions-done
                            aria-keyshortcuts="Escape"
                            onClick={onClosePanel}
                        >
                            {copy.done} <Shortcut>{copy.doneShortcut}</Shortcut>
                        </Button>
                    </div>
                    {locked ? (
                        <p className="kk-permissions-note" role="note">
                            {self ? copy.self : copy.protected}
                        </p>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            {copy.intro}
                        </p>
                    )}
                    <PermissionsEditor
                        permissions={known}
                        disabled={locked}
                        pending={pending}
                        onToggle={toggle}
                    />
                    {line && (
                        <p className="kk-permissions-status" role="status">
                            <span>{line}</span>
                            {stacks.undo > 0 && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    aria-keyshortcuts="Meta+Z"
                                    disabled={pending !== null}
                                    onClick={undo}
                                >
                                    <Undo2 size={16} aria-hidden="true" />
                                    {copy.undo}{" "}
                                    <Shortcut>{copy.undoShortcut}</Shortcut>
                                </Button>
                            )}
                            {stacks.redo > 0 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    aria-keyshortcuts="Meta+Shift+Z"
                                    disabled={pending !== null}
                                    onClick={redo}
                                >
                                    <Redo2 size={16} aria-hidden="true" />
                                    {copy.redo}{" "}
                                    <Shortcut>{copy.redoShortcut}</Shortcut>
                                </Button>
                            )}
                        </p>
                    )}
                </div>
            ) : (
                <div className="kk-permissions-tools" data-kk-permissions>
                    <Button
                        type="button"
                        size="sm"
                        data-kk-permissions-open
                        aria-keyshortcuts="Alt+Meta+P"
                        title={copy.openTitle}
                        onClick={onOpenPanel}
                    >
                        <ShieldCheck size={16} aria-hidden="true" />
                        {copy.open} <Shortcut>{copy.openShortcut}</Shortcut>
                    </Button>
                    {mimicHref ? (
                        <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            title={copy.mimicTitle}
                        >
                            <a href={mimicHref} aria-keyshortcuts="Enter">
                                <Eye size={16} aria-hidden="true" />
                                {copy.mimic}{" "}
                                <Shortcut>{copy.mimicShortcut}</Shortcut>
                            </a>
                        </Button>
                    ) : (
                        <span className="px-2 text-xs text-muted-foreground">
                            {copy.mimicRestricted}
                        </span>
                    )}
                </div>
            )}
        </SelectionTools>
    );
}
