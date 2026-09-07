"use client";

import { useContext, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Check, Copy, MessageSquare, MousePointer2 } from "lucide-react";
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
import { getPagePrompt } from "./page-prompt";
import "./feedback.css";

const CommentForm = dynamic(() => import("./comment-form"));

type Panel =
    | { kind: "closed" }
    | { kind: "comment"; selection: PageSelection }
    | { kind: "choices"; choices: PageSelection[] }
    | { kind: "prompt"; text: string };

export default function ContextualFeedback() {
    const path = usePathname() || "/";
    const { profile } = useContext(ProfileContext);
    return (
        <FeedbackSession
            key={`${path}:${profile?.userId || "visitor"}`}
            path={path}
        />
    );
}

function FeedbackSession({ path }: { path: string }) {
    const { profile } = useContext(ProfileContext);
    const address = useContext(AddressContext);
    const admin = Boolean(
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
                <button
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
                    {expanded && (
                        <span>
                            {copy.close}{" "}
                            <kbd className="ml-2 text-xs opacity-70">Esc</kbd>
                        </span>
                    )}
                </button>
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
                            <div className="grid gap-2">
                                {panel.choices.map((selection, index) => (
                                    <Button
                                        key={index}
                                        variant="outline"
                                        className="min-h-11 h-auto justify-start whitespace-normal text-left"
                                        onClick={() => {
                                            setMode({
                                                kind: "selected",
                                                selection,
                                            });
                                            selection.element?.scrollIntoView({
                                                behavior: "instant",
                                                block: "center",
                                            });
                                            setPanel({ kind: "closed" });
                                        }}
                                    >
                                        {selection.label}
                                    </Button>
                                ))}
                            </div>
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
