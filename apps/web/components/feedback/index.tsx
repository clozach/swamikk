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
import { FeedbackControlPlacement } from "./placement";
import { getPagePrompt } from "./page-prompt";
import { SelectionChoices } from "./selection-choices";
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
    const { mode, setMode, selected, rect } = useSelection(
        path,
        panel.kind !== "closed",
    );
    const expanded = mode.kind !== "closed";

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
            {rect && panel.kind === "closed" && (
                <div
                    aria-hidden="true"
                    className="kk-feedback-outline"
                    style={{
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height,
                    }}
                />
            )}
            <aside
                data-feedback-ui
                className="kk-feedback-tools text-foreground"
                aria-label={copy.open}
            >
                {notice && (
                    <div
                        className="rounded-xl border bg-background px-4 py-3 text-sm shadow-lg"
                        role="status"
                    >
                        {notice}
                    </div>
                )}
                {expanded && (
                    <div className="kk-feedback-dock rounded-2xl border bg-background p-4 shadow-xl">
                        <p className="mb-1 text-sm font-semibold truncate">
                            {selected?.label || copy.select}
                        </p>
                        {!selected && (
                            <p className="mb-3 text-sm text-muted-foreground">
                                {copy.selectHelp}
                            </p>
                        )}
                        <div className="grid gap-1">
                            <Button
                                variant="outline"
                                className="min-h-11 justify-between"
                                onClick={() => {
                                    setMode({ kind: "closed" });
                                    setNotice("");
                                }}
                            >
                                {copy.close}
                                <kbd className="text-xs">Esc</kbd>
                            </Button>
                            <Button
                                className="min-h-11 justify-start"
                                onClick={() =>
                                    setPanel({
                                        kind: "comment",
                                        selection:
                                            selected || pageSelection(path),
                                    })
                                }
                            >
                                <MessageSquare />
                                {copy.comment}
                            </Button>
                            <Button
                                variant="ghost"
                                className="min-h-11 justify-start"
                                onClick={() =>
                                    setPanel({
                                        kind: "choices",
                                        choices: pageChoices(path),
                                    })
                                }
                            >
                                <MousePointer2 />
                                {selected ? copy.chooseAgain : copy.select}
                            </Button>
                            {canEdit && selected?.authorTarget && (
                                <Button
                                    variant="outline"
                                    className="min-h-11 justify-start"
                                    onClick={() =>
                                        setPanel({
                                            kind: "edit",
                                            target: selected.authorTarget!,
                                        })
                                    }
                                >
                                    <Pencil />
                                    {pageEditCopy.edit}
                                </Button>
                            )}
                            {admin && (
                                <>
                                    <Button
                                        variant="ghost"
                                        disabled={copying}
                                        className="min-h-11 justify-start"
                                        onClick={copyPrompt}
                                    >
                                        <Copy />
                                        {copying ? copy.loading : copy.copy}
                                    </Button>
                                    <div className="px-3 text-xs text-muted-foreground space-y-2">
                                        <p>{copy.copyPageScope}</p>
                                        <p>{copy.copyHandoff}</p>
                                        <p>{copy.copyPrivacy}</p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        asChild
                                        className="min-h-11 justify-start"
                                    >
                                        <Link href="/dashboard/changes">
                                            <Check />
                                            {copy.review}
                                        </Link>
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </aside>
            <Dialog
                open={panel.kind !== "closed"}
                onOpenChange={(open) => {
                    if (!open) setPanel({ kind: "closed" });
                }}
            >
                <DialogContent
                    data-feedback-ui
                    className="kk-feedback-dialog max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl"
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
                            onSent={() => {
                                setPanel({ kind: "closed" });
                                setNotice(copy.sent);
                            }}
                        />
                    )}
                    {panel.kind === "choices" && (
                        <>
                            <DialogTitle>{copy.select}</DialogTitle>
                            <DialogDescription>
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
