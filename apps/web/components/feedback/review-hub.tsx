"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type {
    ContextualFeedback,
    ContentChange,
    FeedbackDetail,
} from "@courselit/common-models";
import { checkPermission } from "@courselit/utils";
import { ProfileContext } from "@components/contexts";
import { FEEDBACK_ADMIN_PERMISSIONS } from "@ui-config/constants";
import { feedbackUi as copy } from "@config/strings";
import { Button } from "@/components/ui/button";
import { feedbackRequest, allFeedbackPages } from "./api";
import MailboxSettings from "./mailbox-settings";
import MailboxStatus from "./mailbox-status";
import ProposalReview, { changeStateLabel } from "./proposal-review";

type HubState =
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | {
          kind: "ready";
          feedback: ContextualFeedback[];
          changes: ContentChange[];
      };

export default function ReviewHub() {
    const { profile } = useContext(ProfileContext);
    const admin = Boolean(
        profile?.permissions &&
            checkPermission(profile.permissions, FEEDBACK_ADMIN_PERMISSIONS),
    );
    const router = useRouter();
    const search = useSearchParams();
    const id = search?.get("id");
    const feedbackId = search?.get("feedback");
    const [state, setState] = useState<HubState>({ kind: "loading" });
    const [selected, setSelected] = useState<ContentChange | null>(null);
    const [prompt, setPrompt] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const refresh = useCallback(async () => {
        if (!admin) return;
        setState({ kind: "loading" });
        try {
            const [comments, proposals, detail] = await Promise.all([
                allFeedbackPages<ContextualFeedback>(
                    "/api/feedback",
                    "feedback",
                ),
                allFeedbackPages<ContentChange>(
                    "/api/content-changes",
                    "changes",
                ),
                id
                    ? feedbackRequest<{ change: ContentChange }>(
                          `/api/content-changes/${encodeURIComponent(id)}`,
                      )
                    : Promise.resolve(null),
            ]);
            setState({
                kind: "ready",
                feedback: comments,
                changes: proposals,
            });
            setSelected(detail?.change || null);
        } catch (error) {
            setState({
                kind: "error",
                message:
                    error instanceof Error ? error.message : copy.loadFailed,
            });
        }
    }, [admin, id]);
    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        if (state.kind === "ready" && feedbackId) {
            const target = document.getElementById(`feedback-${feedbackId}`);
            target?.scrollIntoView({ block: "center" });
            target?.focus();
        }
    }, [state.kind, feedbackId]);

    async function commentAction(
        comment: ContextualFeedback,
        action: "prompt" | "state",
    ) {
        setBusy(true);
        setNotice("");
        try {
            if (action === "prompt") {
                const result = await feedbackRequest<FeedbackDetail>(
                    `/api/feedback/${encodeURIComponent(comment.id)}`,
                );
                if (!result.prompt) throw new Error(copy.loadFailed);
                try {
                    await navigator.clipboard.writeText(result.prompt);
                    setNotice(copy.copied);
                } catch {
                    setPrompt(result.prompt);
                    setNotice(copy.copyFailed);
                }
            } else {
                await feedbackRequest(
                    `/api/feedback/${encodeURIComponent(comment.id)}`,
                    { action: comment.state === "open" ? "close" : "reopen" },
                );
                await refresh();
            }
        } catch (error) {
            setNotice(
                error instanceof Error ? error.message : copy.actionFailed,
            );
        } finally {
            setBusy(false);
        }
    }

    if (!profile) return <p className="p-8">{copy.loading}</p>;
    if (!admin) return <p className="p-8">{copy.accessDenied}</p>;
    return (
        <main
            className="mx-auto w-full max-w-7xl p-4 md:p-8 pb-28"
            data-feedback-id="changes-hub"
            data-feedback-label={copy.review}
        >
            {state.kind === "loading" && <p role="status">{copy.loading}</p>}
            {state.kind === "error" && (
                <div role="alert">
                    <p>{state.message}</p>
                    <Button className="mt-4 min-h-11" onClick={refresh}>
                        {copy.reload}
                    </Button>
                </div>
            )}
            {state.kind === "ready" &&
                (selected ? (
                    <ProposalReview
                        key={selected.id}
                        change={selected}
                        onChange={(change) => {
                            setSelected(change);
                            if (change.id !== id)
                                router.push(
                                    `/dashboard/changes?id=${encodeURIComponent(change.id)}`,
                                );
                        }}
                    />
                ) : (
                    <>
                        <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
                            <h1 className="text-3xl font-semibold tracking-tight">
                                {copy.review}
                            </h1>
                            <Button
                                variant="outline"
                                className="min-h-11"
                                onClick={refresh}
                            >
                                {copy.reload}
                            </Button>
                        </header>
                        <div className="grid gap-5 md:grid-cols-2 mb-10">
                            <section className="rounded-2xl border bg-muted/30 p-6">
                                <h2 className="text-xl font-semibold mb-3">
                                    {copy.build}
                                </h2>
                                <p className="mb-3">{copy.guide}</p>
                                <p className="text-sm text-muted-foreground">
                                    {copy.approvalGuide}
                                </p>
                            </section>
                            <section className="rounded-2xl border p-6">
                                <h2 className="text-xl font-semibold mb-3">
                                    {copy.organize}
                                </h2>
                                <p className="text-sm text-muted-foreground mb-4">
                                    {copy.contentGuide}
                                </p>
                                <Button
                                    asChild
                                    variant="outline"
                                    className="min-h-11"
                                >
                                    <Link href="/dashboard/content">
                                        {copy.organize}
                                    </Link>
                                </Button>
                            </section>
                        </div>
                        <MailboxSettings />
                        <section className="mb-10">
                            <h2 className="text-xl font-semibold mb-4">
                                {copy.proposals}
                            </h2>
                            {!state.changes.length ? (
                                <p className="text-muted-foreground">
                                    {copy.emptyProposals}
                                </p>
                            ) : (
                                <ul className="grid gap-3">
                                    {state.changes.map((change) => (
                                        <li key={change.id}>
                                            <Link
                                                href={`/dashboard/changes?id=${encodeURIComponent(change.id)}`}
                                                className="block rounded-xl border p-5 hover:bg-muted/40 focus-visible:outline focus-visible:outline-primary"
                                            >
                                                <div className="font-medium">
                                                    {change.summary}
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    {copy.version}{" "}
                                                    {change.version} ·{" "}
                                                    {changeStateLabel(change)}
                                                </p>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                        <section>
                            <h2 className="text-xl font-semibold mb-4">
                                {copy.inbox}
                            </h2>
                            {!state.feedback.length ? (
                                <p className="text-muted-foreground">
                                    {copy.emptyInbox}
                                </p>
                            ) : (
                                <ul className="grid gap-4">
                                    {state.feedback.map((comment) => (
                                        <li
                                            key={comment.id}
                                            id={`feedback-${comment.id}`}
                                            tabIndex={-1}
                                            className="rounded-xl border p-5 focus:outline focus:outline-primary"
                                        >
                                            <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                                                <span>
                                                    {comment.actor.kind} ·{" "}
                                                    {new Date(
                                                        comment.createdAt,
                                                    ).toLocaleString()}
                                                </span>
                                                <span>{comment.state}</span>
                                            </div>
                                            <p className="mt-3 whitespace-pre-wrap break-words">
                                                {comment.text}
                                            </p>
                                            <p className="mt-3 text-sm text-muted-foreground">
                                                {comment.target.kind === "page"
                                                    ? `${comment.target.path} · ${comment.target.label || comment.target.componentId}`
                                                    : `${comment.target.lessonId} · ${comment.target.field}`}
                                            </p>
                                            {!!comment.photoMediaIds.length && (
                                                <div
                                                    className="mt-4 flex flex-wrap gap-3"
                                                    aria-label={copy.photoCount}
                                                >
                                                    {comment.photoMediaIds.map(
                                                        (mediaId) => (
                                                            <a
                                                                key={mediaId}
                                                                href={`/api/feedback/${encodeURIComponent(comment.id)}/photos/${encodeURIComponent(mediaId)}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                <img
                                                                    className="h-28 w-36 rounded-lg border object-contain"
                                                                    src={`/api/feedback/${encodeURIComponent(comment.id)}/photos/${encodeURIComponent(mediaId)}`}
                                                                    alt={
                                                                        copy.photo
                                                                    }
                                                                    loading="lazy"
                                                                />
                                                            </a>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                            <MailboxStatus
                                                comment={comment}
                                                onChanged={refresh}
                                            />
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <Button
                                                    variant="outline"
                                                    className="min-h-11"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        commentAction(
                                                            comment,
                                                            "prompt",
                                                        )
                                                    }
                                                >
                                                    {copy.savedPrompt}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    className="min-h-11"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        commentAction(
                                                            comment,
                                                            "state",
                                                        )
                                                    }
                                                >
                                                    {comment.state === "open"
                                                        ? copy.closeComment
                                                        : copy.reopenComment}
                                                </Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                        {notice && (
                            <p role="status" className="my-4">
                                {notice}
                            </p>
                        )}
                        {prompt && (
                            <label className="grid gap-2 mt-5">
                                {copy.savedPrompt}
                                <textarea
                                    readOnly
                                    rows={12}
                                    className="rounded-lg border bg-background p-3 text-sm"
                                    value={prompt}
                                    onFocus={(event) =>
                                        event.currentTarget.select()
                                    }
                                />
                            </label>
                        )}
                    </>
                ))}
        </main>
    );
}
