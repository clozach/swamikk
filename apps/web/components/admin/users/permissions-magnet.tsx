"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Redo2, Undo2 } from "lucide-react";
import type { Address, User } from "@courselit/common-models";
import { permissionsUi as copy } from "@config/strings";
import { ADMIN_PERMISSIONS } from "@ui-config/constants";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectionTools } from "@/components/feedback/selection-tools";
import { Shortcut } from "@/components/feedback/shortcut";
import type { TargetBounds } from "@/components/feedback/magnet-placement";
import { useVisualViewport } from "@/components/feedback/viewport";
import PermissionsEditor from "./permissions-editor";
import permissionToCaptionMap from "./permissions-to-caption-map";
import { savePermissions } from "./use-permissions";
import "./permissions-magnet.css";

/** What the last save did, shown where the click happened until the next act. */
type Status =
    | { kind: "idle" }
    | { kind: "changed"; message: string }
    | { kind: "failed"; message: string };

const isTyping = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !!target.closest("input,textarea,select,[contenteditable=true]");

/**
 * What changed between two permission lists, and how to say it. The simple
 * Admin checkbox and the advanced panel's nine boxes share one save path
 * (and one undo/redo stack of full-list snapshots), so this is the one place
 * that turns "these lists differ" into a busy-id and a status line — used
 * for a fresh toggle and for every undo/redo alike, since both call through
 * the same commit. Returns null for two identical lists (nothing to save).
 */
function identifyChange(before: string[], after: string[]) {
    const added = after.filter((p) => !before.includes(p));
    const removed = before.filter((p) => !after.includes(p));
    if (!added.length && !removed.length) return null;
    // The Admin checkbox itself can start from indeterminate (some but not
    // all six already granted, reachable one box at a time from the advanced
    // panel) — a click from there unions in only the missing ones, so
    // "every admin permission that moved" is the right bundle test, not
    // "moved from none to all six": ending at all six (or all zero), having
    // touched nothing but admin permissions, is what "Admin: on/off" means.
    const touchedOnlyAdmin = [...added, ...removed].every((p) =>
        ADMIN_PERMISSIONS.includes(p),
    );
    const afterAdminCount = ADMIN_PERMISSIONS.filter((p) =>
        after.includes(p),
    ).length;
    if (
        touchedOnlyAdmin &&
        (afterAdminCount === ADMIN_PERMISSIONS.length || afterAdminCount === 0)
    )
        return {
            id: "__admin_bundle__",
            message: afterAdminCount ? copy.adminOn : copy.adminOff,
        };
    if (added.length + removed.length === 1) {
        const only = added[0] ?? removed[0];
        return {
            id: only,
            message: `${permissionToCaptionMap[only]}: ${added.length ? copy.on : copy.off}`,
        };
    }
    // Not reachable through this UI today (every action here is either one
    // box or the whole Admin bundle) — kept as an honest fallback rather
    // than a silent mislabel if that ever changes.
    return {
        id: null,
        message: `${added.length + removed.length} permissions changed`,
    };
}

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
 * the two things an admin does with an account from here — a single Admin
 * checkbox (the one distinction KK's site actually needs day to day: a
 * student or an admin) and viewing the site as that member — each with its
 * chord, plus a small "…" into the advanced view for the rare finer-grained
 * case. Open, that advanced view is the full permissions panel: nine boxes
 * that save at once, a way back beside the change (Undo ⌘Z), and the row
 * still in view. Al, 2026-09-14, on the nine-box panel as the *only* control:
 * "far too complex for KK" — two implicit states (logged-out, student) and
 * one explicit one (admin), the last a single checkbox.
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
    onOutcomeElsewhere,
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
    /**
     * A save that finished after this account was deselected (a different
     * row chosen, the list refreshed, the magnet dismissed) — there is no
     * status line left to show it in, so the parent surfaces it some other
     * way (a toast). The account's own row still updates via onSaved
     * regardless; this is only for the confirmation the magnet itself can
     * no longer display.
     */
    onOutcomeElsewhere?: (message: string) => void;
}) {
    const bounds = useElementBounds(rowElement);
    // Whether ANY save is in flight (disables everything); which single box,
    // if any, it is (drives that one box's aria-busy — null for a bundle
    // toggle, since no single box is "the" target of one).
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
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
    // True until this instance unmounts (a different row selected, the list
    // refreshed, the magnet dismissed) — commit() checks it after its await,
    // since React drops any setState the unmounted instance would otherwise
    // make.
    const mounted = useRef(true);
    useEffect(
        () => () => {
            mounted.current = false;
        },
        [],
    );
    const adminCheckboxRef = useRef<HTMLButtonElement>(null);
    const advancedButtonRef = useRef<HTMLButtonElement>(null);
    // Whether the Admin checkbox held focus at the moment it disabled itself
    // for the save — Radix's checkbox is a real <button>, and a disabled
    // button is dropped from the focus area the instant `saving` flips true,
    // so the browser blurs it to <body>. Restored below once the save clears.
    const hadFocus = useRef(false);
    const self = selfUserId === user.userId;
    const locked = self || protectedAccount;
    const name = user.name || user.email;
    const adminGranted = ADMIN_PERMISSIONS.filter((p) =>
        known.includes(p),
    ).length;
    // Some-but-not-all is a real, reachable state (the advanced panel can
    // produce it one box at a time) — represented honestly, not coerced.
    const adminChecked: boolean | "indeterminate" =
        adminGranted === 0
            ? false
            : adminGranted === ADMIN_PERMISSIONS.length
              ? true
              : "indeterminate";

    const commit = useCallback(
        async (next: string[], move: "do" | "undo" | "redo") => {
            const before = current.current;
            const change = identifyChange(before, next);
            if (!change) return;
            setBusyId(change.id);
            setSaving(true);
            setStatus({ kind: "idle" });
            const result = await savePermissions(address, user.userId, next);
            if (!mounted.current) {
                // Deselected mid-save. The row still updates for whoever is
                // looking at the list (onSaved reaches into the still-live
                // parent regardless of this instance); there is no status
                // line left to show the outcome in, so the parent does it
                // instead — never silently drop a change nobody saw land.
                if (result.kind === "applied") {
                    onSaved(result.permissions);
                    const landed = identifyChange(before, result.permissions);
                    onOutcomeElsewhere?.(
                        `${name}: ${landed?.message ?? change.message}`,
                    );
                } else if (result.kind === "refused") {
                    onOutcomeElsewhere?.(`${name}: ${copy.protected}`);
                } else {
                    onOutcomeElsewhere?.(
                        `${name}: ${result.message || copy.failed}`,
                    );
                }
                return;
            }
            setSaving(false);
            setBusyId(null);
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
                // Say what actually landed, not what was optimistically
                // asked for — the server's answer is the truth.
                const landed = identifyChange(before, result.permissions);
                setStatus({
                    kind: "changed",
                    message: landed?.message ?? change.message,
                });
            } else if (result.kind === "refused") {
                setProtectedAccount(true);
                if (hadFocus.current) {
                    // This account's checkbox can never re-enable now — send
                    // focus to the next interactive control instead of
                    // stranding it on <body>.
                    hadFocus.current = false;
                    advancedButtonRef.current?.focus();
                }
            } else {
                setStatus({
                    kind: "failed",
                    message: result.message || copy.failed,
                });
            }
        },
        [address, name, onSaved, onOutcomeElsewhere, user.userId],
    );
    const toggle = (permission: string, on: boolean) =>
        void commit(
            on
                ? [...current.current, permission]
                : current.current.filter((item) => item !== permission),
            "do",
        );
    // Checking adds the whole Admin bundle; unchecking removes it — either
    // way, the non-admin baseline (Buy products, Manage files) is untouched.
    // Radix hands an indeterminate box's own click through as `true`, which
    // reads here as "fill in the missing ones" — a "select all" convention.
    const toggleAdmin = (checked: boolean) => {
        hadFocus.current = document.activeElement === adminCheckboxRef.current;
        void commit(
            checked
                ? Array.from(
                      new Set([...current.current, ...ADMIN_PERMISSIONS]),
                  )
                : current.current.filter(
                      (item) => !ADMIN_PERMISSIONS.includes(item),
                  ),
            "do",
        );
    };
    // A rapid second ⌘Z/⇧⌘Z — OS key-repeat holds it well within typical
    // save latency — would otherwise pop a second stack entry before the
    // first commit's response lands, desyncing the rendered undo/redo counts
    // from the actual stacks. Every other path into commit() already
    // disables its own control while saving; this is the one path (a global
    // keyboard shortcut) with no control to disable.
    const undo = useCallback(() => {
        if (saving) return;
        const previous = past.current.pop();
        if (previous) void commit(previous, "undo");
    }, [commit, saving]);
    const redo = useCallback(() => {
        if (saving) return;
        const next = future.current.pop();
        if (next) void commit(next, "redo");
    }, [commit, saving]);
    // Give the Admin checkbox its keyboard focus back once a save that held
    // it clears — a disabled control drops out of the browser's focus area,
    // so without this a keyboard user's tab position is silently lost after
    // every successful toggle. Skipped once the account is locked (the
    // refused-save branch above hands focus onward instead, since this
    // checkbox will not become focusable again).
    useEffect(() => {
        if (!saving && hadFocus.current && !locked) {
            hadFocus.current = false;
            adminCheckboxRef.current?.focus();
        }
    }, [saving, locked]);

    // ⌘Z / ⇧⌘Z reverse the last change whenever this account is selected —
    // the Admin checkbox alone can change permissions without ever opening
    // the advanced panel, so the way back can't be gated on that panel.
    useEffect(() => {
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
    }, [undo, redo]);

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

    const line = status.kind !== "idle" ? status.message : "";
    // Shared by both views: whatever the last change was (a box in the
    // advanced panel or the Admin checkbox alike), it stays visible with its
    // way back until superseded — collapsing back to the simple view does
    // not clear it.
    const statusLine = line && (
        <p className="kk-permissions-status" role="status">
            <span>{line}</span>
            {stacks.undo > 0 && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-keyshortcuts="Meta+Z"
                    disabled={saving}
                    onClick={undo}
                >
                    <Undo2 size={16} aria-hidden="true" />
                    {copy.undo} <Shortcut>{copy.undoShortcut}</Shortcut>
                </Button>
            )}
            {stacks.redo > 0 && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-keyshortcuts="Meta+Shift+Z"
                    disabled={saving}
                    onClick={redo}
                >
                    <Redo2 size={16} aria-hidden="true" />
                    {copy.redo} <Shortcut>{copy.redoShortcut}</Shortcut>
                </Button>
            )}
        </p>
    );
    const mimicControl = mimicHref ? (
        <Button asChild variant="ghost" size="sm" title={copy.mimicTitle}>
            <a href={mimicHref} aria-keyshortcuts="Enter">
                <Eye size={16} aria-hidden="true" />
                {copy.mimic} <Shortcut>{copy.mimicShortcut}</Shortcut>
            </a>
        </Button>
    ) : (
        <span className="px-2 text-xs text-muted-foreground">
            {copy.mimicRestricted}
        </span>
    );
    const adminNote = locked ? (self ? copy.self : copy.protected) : undefined;
    const adminNoteId = `kk-admin-note-${user.userId}`;

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
                            {adminNote}
                        </p>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            {copy.intro}
                        </p>
                    )}
                    <PermissionsEditor
                        permissions={known}
                        disabled={locked}
                        pending={saving ? (busyId ?? "__admin_bundle__") : null}
                        onToggle={toggle}
                    />
                    {statusLine}
                </div>
            ) : (
                <div className="kk-permissions-tools" data-kk-permissions>
                    <div className="kk-permissions-tools-row">
                        <div className="kk-permissions-admin" title={adminNote}>
                            <label
                                htmlFor={`kk-admin-${user.userId}`}
                                className="kk-permissions-admin-label"
                            >
                                <Checkbox
                                    ref={adminCheckboxRef}
                                    id={`kk-admin-${user.userId}`}
                                    aria-label={copy.adminLabel}
                                    aria-describedby={
                                        locked ? adminNoteId : undefined
                                    }
                                    checked={adminChecked}
                                    disabled={locked || saving}
                                    onCheckedChange={(value) =>
                                        toggleAdmin(value === true)
                                    }
                                />
                                <span>{copy.adminLabel}</span>
                            </label>
                            <button
                                ref={advancedButtonRef}
                                type="button"
                                className="kk-permissions-advanced"
                                data-kk-permissions-open
                                aria-label={copy.advancedTitle}
                                aria-keyshortcuts="Alt+Meta+P `"
                                title={copy.advancedTitle}
                                onClick={onOpenPanel}
                            >
                                {copy.advanced}
                                <Shortcut>{copy.advancedShortcut}</Shortcut>
                            </button>
                        </div>
                        {mimicControl}
                    </div>
                    {locked && (
                        <p
                            id={adminNoteId}
                            className="kk-permissions-note kk-permissions-note--compact"
                            role="note"
                        >
                            {adminNote}
                        </p>
                    )}
                    {statusLine}
                </div>
            )}
        </SelectionTools>
    );
}
