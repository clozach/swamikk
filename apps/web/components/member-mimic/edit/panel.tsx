"use client";

import {
    forwardRef,
    useEffect,
    useId,
    useImperativeHandle,
    useRef,
    useState,
    type KeyboardEvent,
} from "react";
import { ExternalLink, History, Redo2, Undo2, X } from "lucide-react";
import type { MemberEditField } from "@courselit/common-models";
import { memberEditUi as copy } from "@config/strings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Shortcut } from "../../feedback/shortcut";
import MemberEditHistory from "./history";
import {
    ROW_OF,
    useMemberEdit,
    valueOf,
    type MemberEditRow,
} from "./use-member-edit";
import "./member-edit.css";

/** What the banner drives from its own keyboard handling. */
export interface MemberEditPanelHandle {
    undo: () => void;
    redo: () => void;
    /** True while a draft or a pending code would be lost by leaving. */
    isDirty: () => boolean;
}

const CONTACT_KINDS = ["email", "voice", "text"] as const;
const CHECK_INS = ["none", "occasional"] as const;
const selectClass =
    "kk-member-edit-select min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm";

/**
 * The member edit panel: docked beside the member's own page (a bottom sheet
 * on a phone), one row per field with its current value, Save or Enter
 * applying a row at once, the way back at the row (Undo ⌘Z), every edit in
 * History with a permanent Restore. Non-modal on purpose — the page behind
 * stays readable — and kept mounted while hidden so a half-typed value
 * survives closing and reopening.
 */
const MemberEditPanel = forwardRef<
    MemberEditPanelHandle,
    {
        open: boolean;
        subjectName: string;
        onClose: () => void;
        /** Leaves Mimic for the given page — Review refunds. */
        onExit: (redirectTo: string) => void;
        /** After any applied edit: the banner re-reads its subject. */
        onApplied: () => void;
    }
>(function MemberEditPanel(
    { open, subjectName, onClose, onExit, onApplied },
    ref,
) {
    const state = useMemberEdit({ onApplied });
    const {
        load,
        snapshot,
        shown,
        setDraft,
        dirtyFields,
        isDirty,
        status,
        notice,
        clearNotice,
        verifyStep,
        setCode,
        pendingRefund,
        busy,
        canUndo,
        canRedo,
        reload,
        save,
        undo,
        redo,
        restore,
        confirmCode,
        resendCode,
        cancelCode,
    } = state;
    const aside = useRef<HTMLElement>(null);
    const id = useId();
    const [history, setHistory] = useState(false);
    const [historyKey, setHistoryKey] = useState(0);

    useImperativeHandle(
        ref,
        () => ({
            undo: () => void undo(),
            redo: () => void redo(),
            isDirty,
        }),
        [undo, redo, isDirty],
    );

    // The record is read the first time the panel opens, not on every page.
    useEffect(() => {
        if (open && load.kind === "idle") void reload();
    }, [open, load.kind, reload]);

    // Opening puts the keyboard on the first field once the rows exist.
    useEffect(() => {
        if (!open || load.kind !== "ready") return;
        const frame = window.requestAnimationFrame(() => {
            aside.current
                ?.querySelector<HTMLElement>(
                    '[data-kk-member-edit-field="name"]',
                )
                ?.focus();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [open, load.kind]);

    const enterSaves =
        (row: MemberEditRow) =>
        (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            void save(row);
        };
    const kind = shown("contact.kind") as (typeof CONTACT_KINDS)[number];
    const lock = snapshot?.emailLock;
    const emailLocked = !!lock || !!verifyStep;
    const unsavedRows = Array.from(
        new Set(dirtyFields.map((field: MemberEditField) => ROW_OF[field])),
    );

    const statusLine = (row: MemberEditRow) =>
        status?.row === row ? (
            <p
                className="kk-member-edit-status"
                role="status"
                data-kk-member-edit-status={row}
            >
                <span>{status.text}</span>
                {canUndo && (
                    <>
                        {" · "}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-kk-member-edit-undo
                            aria-keyshortcuts="Meta+Z"
                            disabled={busy}
                            onClick={() => void undo()}
                        >
                            <Undo2 size={16} aria-hidden="true" />
                            {copy.undo} <Shortcut>{copy.undoShortcut}</Shortcut>
                        </Button>
                    </>
                )}
                {canRedo && (
                    <>
                        {" · "}
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-kk-member-edit-redo
                            aria-keyshortcuts="Meta+Shift+Z"
                            disabled={busy}
                            onClick={() => void redo()}
                        >
                            <Redo2 size={16} aria-hidden="true" />
                            {copy.redo} <Shortcut>{copy.redoShortcut}</Shortcut>
                        </Button>
                    </>
                )}
            </p>
        ) : null;

    const saveButton = (row: MemberEditRow, disabled = false) => (
        <Button
            type="button"
            size="sm"
            data-kk-member-edit-save={row}
            disabled={busy || disabled}
            onClick={() => void save(row)}
        >
            {copy.save}
        </Button>
    );

    return (
        <>
            <aside
                ref={aside}
                className="kk-member-edit"
                data-kk-member-edit
                data-kk-member-edit-open={open ? "" : undefined}
                data-kk-member-edit-dialog={history ? "" : undefined}
                data-member-mimic-tools
                role="region"
                aria-label={copy.title}
                hidden={!open}
            >
                <div className="kk-member-edit-head">
                    <h2>
                        <strong>{copy.title}</strong> · {subjectName}
                    </h2>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-kk-member-edit-done
                        aria-keyshortcuts="Escape"
                        onClick={onClose}
                    >
                        {copy.done} <Shortcut>{copy.doneShortcut}</Shortcut>
                    </Button>
                </div>
                {notice && (
                    <div
                        className="kk-member-edit-notice"
                        data-kk-member-edit-notice
                    >
                        <span role="status">{notice.text}</span>
                        <button
                            type="button"
                            aria-label={copy.dismiss}
                            onClick={clearNotice}
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </div>
                )}
                {load.kind === "loading" && (
                    <p className="kk-member-edit-help" role="status">
                        {copy.loading}
                    </p>
                )}
                {load.kind === "failed" && (
                    <div className="kk-member-edit-notice" role="alert">
                        <span>{load.message}</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void reload()}
                        >
                            {copy.retry}
                        </Button>
                    </div>
                )}
                {load.kind === "ready" && snapshot && (
                    <>
                        <div className="kk-member-edit-rows">
                            <div
                                className="kk-member-edit-row"
                                data-kk-member-edit-row="name"
                            >
                                <label htmlFor={`${id}-name`}>
                                    {copy.fields.name}
                                </label>
                                <div className="kk-member-edit-control">
                                    <Input
                                        id={`${id}-name`}
                                        data-kk-member-edit-field="name"
                                        autoComplete="off"
                                        value={shown("name")}
                                        onChange={(event) =>
                                            setDraft("name", event.target.value)
                                        }
                                        onKeyDown={enterSaves("name")}
                                    />
                                    {saveButton("name")}
                                </div>
                                {statusLine("name")}
                            </div>

                            <div
                                className="kk-member-edit-row"
                                data-kk-member-edit-row="email"
                            >
                                <label htmlFor={`${id}-email`}>
                                    {copy.fields.email}
                                </label>
                                <div className="kk-member-edit-control">
                                    <Input
                                        id={`${id}-email`}
                                        type="email"
                                        inputMode="email"
                                        autoComplete="off"
                                        data-kk-member-edit-field="email"
                                        aria-describedby={`${id}-email-help`}
                                        disabled={emailLocked}
                                        value={shown("email")}
                                        onChange={(event) =>
                                            setDraft(
                                                "email",
                                                event.target.value,
                                            )
                                        }
                                        onKeyDown={enterSaves("email")}
                                    />
                                    {saveButton("email", emailLocked)}
                                </div>
                                <p
                                    id={`${id}-email-help`}
                                    className="kk-member-edit-help"
                                >
                                    {copy.emailHelp}
                                </p>
                                {lock && (
                                    <p
                                        className="kk-member-edit-lock"
                                        role="note"
                                        data-kk-member-edit-email-lock={lock}
                                    >
                                        {lock === "self"
                                            ? copy.emailLockSelf
                                            : copy.emailLockOwner}
                                    </p>
                                )}
                                {verifyStep && (
                                    <div
                                        className="kk-member-edit-verify"
                                        data-kk-member-edit-verify
                                    >
                                        <p role="status">
                                            {copy.codeSent.replace(
                                                "{email}",
                                                verifyStep.pending.email,
                                            )}
                                        </p>
                                        <label htmlFor={`${id}-code`}>
                                            {copy.codeLabel}
                                        </label>
                                        <Input
                                            id={`${id}-code`}
                                            data-kk-member-edit-code
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            pattern="[0-9]*"
                                            maxLength={6}
                                            value={verifyStep.code}
                                            onChange={(event) =>
                                                setCode(event.target.value)
                                            }
                                            onKeyDown={(event) => {
                                                if (event.key !== "Enter")
                                                    return;
                                                event.preventDefault();
                                                void confirmCode();
                                            }}
                                        />
                                        {verifyStep.error && (
                                            <p
                                                role="alert"
                                                data-kk-member-edit-code-error
                                            >
                                                {verifyStep.error}
                                            </p>
                                        )}
                                        <div className="kk-member-edit-actions">
                                            <Button
                                                type="button"
                                                size="sm"
                                                data-kk-member-edit-confirm
                                                disabled={
                                                    busy ||
                                                    verifyStep.code.length !== 6
                                                }
                                                onClick={() =>
                                                    void confirmCode()
                                                }
                                            >
                                                {copy.confirm}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                data-kk-member-edit-resend
                                                disabled={busy}
                                                onClick={() =>
                                                    void resendCode()
                                                }
                                            >
                                                {copy.resend}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                data-kk-member-edit-cancel
                                                disabled={busy}
                                                onClick={() =>
                                                    void cancelCode()
                                                }
                                            >
                                                {copy.cancel}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                                {statusLine("email")}
                                {snapshot.emailEffects === "pending" && (
                                    <div
                                        className="kk-member-edit-lock"
                                        role="status"
                                    >
                                        <p>{copy.emailEffectsPending}</p>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={busy}
                                            onClick={() => void reload()}
                                        >
                                            {copy.retryEmailEffects}
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div
                                className="kk-member-edit-row"
                                data-kk-member-edit-row="contact"
                                role="group"
                                aria-labelledby={`${id}-contact`}
                            >
                                <span
                                    id={`${id}-contact`}
                                    className="kk-member-edit-row-title"
                                >
                                    {copy.fields.contact}
                                </span>
                                <div className="kk-member-edit-pair">
                                    <div>
                                        <label htmlFor={`${id}-contact-kind`}>
                                            {copy.contactKindLabel}
                                        </label>
                                        <select
                                            id={`${id}-contact-kind`}
                                            className={selectClass}
                                            data-kk-member-edit-field="contact.kind"
                                            value={kind}
                                            onChange={(event) =>
                                                setDraft(
                                                    "contact.kind",
                                                    event.target.value,
                                                )
                                            }
                                            onKeyDown={enterSaves("contact")}
                                        >
                                            {CONTACT_KINDS.map((option) => (
                                                <option
                                                    key={option}
                                                    value={option}
                                                >
                                                    {copy.contactKind[option]}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor={`${id}-contact-value`}>
                                            {kind === "email"
                                                ? copy.contactEmail
                                                : copy.contactPhone}
                                        </label>
                                        <Input
                                            id={`${id}-contact-value`}
                                            type={
                                                kind === "email"
                                                    ? "email"
                                                    : "tel"
                                            }
                                            inputMode={
                                                kind === "email"
                                                    ? "email"
                                                    : "tel"
                                            }
                                            autoComplete="off"
                                            data-kk-member-edit-field="contact.value"
                                            value={shown("contact.value")}
                                            onChange={(event) =>
                                                setDraft(
                                                    "contact.value",
                                                    event.target.value,
                                                )
                                            }
                                            onKeyDown={enterSaves("contact")}
                                        />
                                    </div>
                                </div>
                                <div className="kk-member-edit-control">
                                    {saveButton("contact")}
                                </div>
                                {statusLine("contact")}
                            </div>

                            <div
                                className="kk-member-edit-row"
                                data-kk-member-edit-row="checkIns"
                            >
                                <label htmlFor={`${id}-check-ins`}>
                                    {copy.fields.checkIns}
                                </label>
                                <div className="kk-member-edit-control">
                                    <select
                                        id={`${id}-check-ins`}
                                        className={selectClass}
                                        data-kk-member-edit-field="checkIns"
                                        value={shown("checkIns")}
                                        onChange={(event) =>
                                            setDraft(
                                                "checkIns",
                                                event.target.value,
                                            )
                                        }
                                        onKeyDown={enterSaves("checkIns")}
                                    >
                                        {CHECK_INS.map((option) => (
                                            <option key={option} value={option}>
                                                {copy.checkIns[option]}
                                            </option>
                                        ))}
                                    </select>
                                    {saveButton("checkIns")}
                                </div>
                                {statusLine("checkIns")}
                            </div>
                        </div>

                        <div className="kk-member-edit-foot">
                            {unsavedRows.length > 0 && (
                                <p
                                    className="kk-member-edit-unsaved"
                                    role="status"
                                    data-kk-member-edit-unsaved
                                >
                                    {copy.unsaved.replace(
                                        "{fields}",
                                        unsavedRows
                                            .map((row) => copy.fields[row])
                                            .join(", "),
                                    )}
                                </p>
                            )}
                            {pendingRefund && (
                                <p
                                    className="kk-member-edit-lock"
                                    role="note"
                                    data-kk-member-edit-pending-refund
                                >
                                    {copy.pendingRefund}
                                </p>
                            )}
                            <div className="kk-member-edit-actions">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    data-kk-member-edit-history
                                    onClick={() => setHistory(true)}
                                >
                                    <History size={16} aria-hidden="true" />
                                    {copy.history}
                                </Button>
                                {snapshot.actor.canReviewRefunds && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        data-kk-member-edit-review-refunds
                                        title={copy.reviewRefundsHelp}
                                        onClick={() =>
                                            onExit("/dashboard/refund-review")
                                        }
                                    >
                                        {copy.reviewRefunds}
                                        <ExternalLink
                                            size={16}
                                            aria-hidden="true"
                                        />
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    data-kk-member-edit-done
                                    aria-keyshortcuts="Escape"
                                    onClick={onClose}
                                >
                                    {copy.done}{" "}
                                    <Shortcut>{copy.doneShortcut}</Shortcut>
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </aside>
            <Dialog
                open={history}
                onOpenChange={(next) => {
                    if (!next) setHistory(false);
                }}
            >
                <DialogContent
                    data-member-mimic-tools
                    className="kk-feedback-dialog kk-member-edit-dialog max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl"
                >
                    {snapshot && (
                        <MemberEditHistory
                            actorUserId={snapshot.actor.userId}
                            refreshKey={historyKey}
                            current={(field) => valueOf(snapshot, field)}
                            onRestore={async (edit) => {
                                const result = await restore(edit);
                                if (result) setHistoryKey((key) => key + 1);
                                return result;
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
});

export default MemberEditPanel;
