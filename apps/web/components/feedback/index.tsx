"use client";

import { useContext, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
    Pencil,
    Check,
    Copy,
    MessageSquare,
    MousePointer2,
} from "lucide-react";
import type { Profile } from "@courselit/common-models";
import { useMemberMimic } from "@/components/member-mimic/context";
import { pageEditCopy } from "./page-edit-copy";
import { checkPermission } from "@courselit/utils";
import { AddressContext, ProfileContext } from "@components/contexts";
import { FEEDBACK_ADMIN_PERMISSIONS } from "@ui-config/constants";
import { feedbackUi as copy } from "@config/strings";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import { PageSelection, pageChoices, pageSelection } from "./targets";
import { useSelection } from "./use-selection";
import { FeedbackControlPlacement, FeedbackOutline } from "./placement";
import { getPagePrompt } from "./page-prompt";
import { SelectionTools } from "./selection-tools";
import { useVisualViewport } from "./viewport";
import { SelectionChoices } from "./selection-choices";
import { usePanelFocusReturn } from "./focus-return";
import "./feedback.css";

const PageWidgetEditor = dynamic(() => import("./page-widget-editor"));
const CommentForm = dynamic(() => import("./comment-form"));

type Panel =
    | { kind: "closed" }
    | { kind: "edit"; target: { pageId: string; widgetId: string } }
    | { kind: "comment"; selection: PageSelection }
    | { kind: "choices"; choices: PageSelection[] }
    | { kind: "prompt"; text: string };

export default function ContextualFeedback() {
    const path = usePathname() || "/";
    const mimic = useMemberMimic();
    const { profile } = useContext(ProfileContext);
    if (mimic.kind !== "inactive") return null;
    return (
        <FeedbackSession
            key={`${path}:${profile?.userId || "visitor"}:${mimic.kind}`}
            path={path}
        />
    );
}

function FeedbackSession({ path }: { path: string }) {
    const { profile } = useContext(ProfileContext);
    const address = useContext(AddressContext);
    const mimic = useMemberMimic();
    const canEdit =
        mimic.kind === "inactive" &&
        !!profile?.permissions?.includes("site:manage");
    const admin = Boolean(
        mimic.kind === "inactive" &&
            profile?.permissions &&
            checkPermission(profile.permissions, FEEDBACK_ADMIN_PERMISSIONS),
    );
    const [panel, setPanel] = useState<Panel>({ kind: "closed" });
    const [notice, setNotice] = useState("");
    const [copying, setCopying] = useState(false);
    const focusReturn = usePanelFocusReturn(panel.kind !== "closed");
    const { mode, setMode, selected, rect } = useSelection(
        path,
        panel.kind !== "closed",
    );
    const expanded = mode.kind !== "closed";
    const viewport = useVisualViewport();
    const composer = panel.kind === "comment";
    const fullComposer =
        composer &&
        !!viewport &&
        (viewport.width <= 640 || viewport.height <= 480);

    async function copyPrompt() {
        setCopying(true);
        setNotice("");
        try {
            const text = await getPagePrompt(path);
            try {
                await navigator.clipboard.writeText(text);
                setNotice(copy.copied);
            } catch {
                setPanel({ kind: "prompt", text });
            }
        } catch (error) {
            setNotice(error instanceof Error ? error.message : copy.loadFailed);
        } finally {
            setCopying(false);
        }
    }

    return (
        <>
            <FeedbackControlPlacement>
                <button
                    ref={focusReturn.help}
                    type="button"
                    className={`kk-feedback-toggle ${expanded ? "is-open" : ""}`}
                    aria-label={expanded ? copy.close : copy.open}
                    aria-expanded={expanded}
                    aria-keyshortcuts="Shift+/ Escape"
                    title={
                        expanded
                            ? "Close (? or Escape)"
                            : "Comment on this page (?)"
                    }
                    onClick={() => {
                        setMode(
                            expanded
                                ? { kind: "closed" }
                                : { kind: "choosing" },
                        );
                        setNotice("");
                    }}
                >
                    <span className="kk-question" aria-hidden="true">
                        ?
                    </span>
                </button>
            </FeedbackControlPlacement>
            {rect && panel.kind === "closed" && <FeedbackOutline rect={rect} />}
            {notice && (
                <div
                    data-feedback-ui
                    className="kk-feedback-notice border bg-background text-foreground shadow-lg"
                    role="status"
                >
                    {notice}
                </div>
            )}
            {expanded && (
                <SelectionTools
                    target={selected ? rect : null}
                    label={selected?.label || copy.select}
                >
                    <Button
                        ref={focusReturn.comment}
                        size="icon"
                        aria-label={copy.comment}
                        title={copy.comment}
                        onClick={(event) => {
                            focusReturn.remember(event.currentTarget);
                            setPanel({
                                kind: "comment",
                                selection: selected || pageSelection(path),
                            });
                        }}
                    >
                        <MessageSquare />
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        aria-label={selected ? copy.chooseAgain : copy.select}
                        title={selected ? copy.chooseAgain : copy.select}
                        onClick={(event) => {
                            focusReturn.remember(event.currentTarget);
                            setPanel({
                                kind: "choices",
                                choices: pageChoices(path),
                            });
                        }}
                    >
                        <MousePointer2 />
                    </Button>
                    {canEdit && selected?.authorTarget && (
                        <Button
                            size="icon"
                            variant="outline"
                            aria-label={pageEditCopy.edit}
                            title={pageEditCopy.edit}
                            onClick={(event) => {
                                focusReturn.remember(event.currentTarget);
                                setPanel({
                                    kind: "edit",
                                    target: selected.authorTarget!,
                                });
                            }}
                        >
                            <Pencil />
                        </Button>
                    )}
                    {admin && (
                        <>
                            <Button
                                size="icon"
                                variant="ghost"
                                disabled={copying}
                                aria-label={copying ? copy.loading : copy.copy}
                                aria-describedby="kk-feedback-copy-boundary"
                                title={copy.copy}
                                onClick={(event) => {
                                    focusReturn.remember(event.currentTarget);
                                    void copyPrompt();
                                }}
                            >
                                <Copy />
                            </Button>
                            <span
                                id="kk-feedback-copy-boundary"
                                className="sr-only"
                            >
                                {copy.copyPageScope} {copy.copyHandoff}{" "}
                                {copy.copyPrivacy}
                            </span>
                            <Button
                                size="icon"
                                variant="ghost"
                                asChild
                                title={copy.review}
                            >
                                <Link
                                    href="/dashboard/changes"
                                    aria-label={copy.review}
                                >
                                    <Check />
                                </Link>
                            </Button>
                        </>
                    )}
                </SelectionTools>
            )}
            <Dialog
                open={panel.kind !== "closed"}
                onOpenChange={(open) => {
                    if (!open) setPanel({ kind: "closed" });
                }}
            >
                <DialogContent
                    onCloseAutoFocus={focusReturn.restore}
                    data-feedback-ui
                    className={`kk-feedback-dialog ${composer ? "kk-feedback-composer" : `max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl ${panel.kind === "choices" ? "kk-feedback-choices" : ""}`}`}
                    data-full-viewport={fullComposer || undefined}
                    style={
                        viewport
                            ? {
                                  left: fullComposer
                                      ? viewport.left
                                      : viewport.left + viewport.width / 2,
                                  top: fullComposer
                                      ? viewport.top
                                      : viewport.top + viewport.height / 2,
                                  width: fullComposer
                                      ? viewport.width
                                      : Math.min(
                                            composer ? 560 : 512,
                                            viewport.width - 32,
                                        ),
                                  maxWidth: viewport.width,
                                  height: composer
                                      ? fullComposer
                                          ? viewport.height
                                          : Math.min(700, viewport.height - 32)
                                      : undefined,
                                  maxHeight: fullComposer
                                      ? viewport.height
                                      : viewport.height - 32,
                                  transform: fullComposer ? "none" : undefined,
                              }
                            : undefined
                    }
                >
                    {panel.kind === "edit" && canEdit && profile && (
                        <PageWidgetEditor
                            target={panel.target}
                            profile={profile as Profile}
                            address={address}
                        />
                    )}
                    {panel.kind === "comment" && (
                        <CommentForm
                            key={`${profile?.userId || "visitor"}:${JSON.stringify(panel.selection.target)}`}
                            selection={panel.selection}
                            profile={profile}
                            address={address}
                            admin={admin}
                            onClose={() => setPanel({ kind: "closed" })}
                            onSent={() => {
                                setPanel({ kind: "closed" });
                                setNotice(copy.sent);
                            }}
                        />
                    )}
                    {panel.kind === "choices" && (
                        <>
                            <DialogTitle className="sr-only">
                                {copy.select}
                            </DialogTitle>
                            <DialogDescription className="sr-only">
                                {copy.selectHelp}
                            </DialogDescription>
                            <SelectionChoices
                                choices={panel.choices}
                                onSelect={(selection) => {
                                    setMode({ kind: "selected", selection });
                                    selection.element?.scrollIntoView({
                                        behavior: "instant",
                                        block: "center",
                                    });
                                    setPanel({ kind: "closed" });
                                }}
                            />
                        </>
                    )}
                    {panel.kind === "prompt" && (
                        <>
                            <DialogTitle>{copy.savedPrompt}</DialogTitle>
                            <DialogDescription>
                                {copy.copyFailed}
                            </DialogDescription>
                            <textarea
                                readOnly
                                aria-label={copy.savedPrompt}
                                value={panel.text}
                                rows={12}
                                className="w-full rounded border p-3 text-sm"
                                onFocus={(event) =>
                                    event.currentTarget.select()
                                }
                            />
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
