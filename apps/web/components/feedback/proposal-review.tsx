import {
    isPagePublication,
    hasGlobalDrafts,
} from "@/services/content-changes/page-publication-types";
import PagePublicationPreview from "./page-publication-preview";
import { isPageCreation } from "@/services/content-changes/page-creation-types";
import PageCreationPreview from "./page-creation-preview";
import { useContext, useState } from "react";
import Link from "next/link";
import { TextRenderer } from "@courselit/page-blocks";
import type {
    ContentChange,
    ContentChangeAction,
} from "@courselit/common-models";
import { ThemeContext } from "@components/contexts";
import { Button } from "@/components/ui/button";
import { feedbackUi as copy } from "@config/strings";
import { feedbackRequest } from "./api";
import { isPageWidgetChange } from "@courselit/common-models";
import PageProposalPreview from "./page-proposal-preview";

export const changeStateLabel = (change: ContentChange) =>
    ({
        proposed: copy.proposed,
        applied: copy.applied,
        applying: copy.applying,
        rejected: copy.rejected,
        stale: copy.stale,
        failed: copy.failedState,
        uncertain: copy.uncertain,
    })[change.state.kind];

export default function ProposalReview({
    change,
    onChange,
}: {
    change: ContentChange;
    onChange: (change: ContentChange) => void;
}) {
    const { theme } = useContext(ThemeContext);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState("");
    async function act(action: ContentChangeAction) {
        setWorking(true);
        setError("");
        try {
            const result = await feedbackRequest<{ change: ContentChange }>(
                `/api/content-changes/${encodeURIComponent(change.id)}`,
                action,
            );
            onChange(result.change);
        } catch (failure) {
            setError(
                failure instanceof Error ? failure.message : copy.actionFailed,
            );
            // An interrupted response is not proof of a failed write. Read the
            // durable state before offering the next action.
            try {
                const result = await feedbackRequest<{ change: ContentChange }>(
                    `/api/content-changes/${encodeURIComponent(change.id)}`,
                );
                onChange(result.change);
            } catch {
                /* Explicit refresh remains available. */
            }
        } finally {
            setWorking(false);
        }
    }
    return (
        <article
            className="grid gap-6"
            data-feedback-id={`proposal-${change.id}`}
            data-feedback-label={change.summary}
        >
            <div>
                <Link
                    className="inline-flex min-h-11 items-center text-sm underline"
                    href="/dashboard/changes"
                >
                    {copy.return}
                </Link>
                <p className="mt-4 text-sm text-muted-foreground">
                    {copy.version} {change.version} · {changeStateLabel(change)}
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                    {change.summary}
                </h1>
            </div>
            {isPagePublication(change) ? (
                <PagePublicationPreview change={change} />
            ) : isPageCreation(change) ? (
                <PageCreationPreview change={change} />
            ) : isPageWidgetChange(change) ? (
                <PageProposalPreview change={change} />
            ) : (
                <>
                    <div className="grid gap-4 lg:grid-cols-2">
                        {(["before", "after"] as const).map((side) => (
                            <section
                                key={side}
                                className={`min-w-0 rounded-xl border p-5 ${side === "after" ? "border-primary/50" : ""}`}
                            >
                                <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                    {copy[side]}
                                </h2>
                                <h3 className="mb-4 text-2xl font-semibold break-words">
                                    {change.preview[side].title}
                                </h3>
                                <div className="break-words">
                                    <TextRenderer
                                        json={change.preview[side].content}
                                        theme={theme.theme}
                                    />
                                </div>
                            </section>
                        ))}
                    </div>
                    <section className="rounded-xl border bg-muted/30 p-5 space-y-3">
                        <h2 className="text-lg font-semibold">
                            {copy.consequences}
                        </h2>
                        <p>{copy.textScope}</p>
                        <p>
                            {change.baseline.published
                                ? copy.publishedEffect
                                : copy.draftEffect}
                        </p>
                        <p>{copy.undoLimit}</p>
                        <p className="text-sm text-muted-foreground">
                            {copy.exactApproval}
                        </p>
                    </section>
                </>
            )}
            {"reason" in change.state && (
                <p role="status" className="rounded-lg border p-4">
                    {change.state.reason}
                </p>
            )}
            {error && (
                <p role="alert" className="text-destructive">
                    {error}
                </p>
            )}
            <div className="flex flex-wrap gap-3">
                {change.state.kind === "proposed" && (
                    <>
                        <Button
                            className="min-h-11"
                            disabled={
                                working ||
                                (isPagePublication(change) &&
                                    hasGlobalDrafts(
                                        change.preview.globalDrafts,
                                    ))
                            }
                            onClick={() =>
                                act({
                                    action: "approve",
                                    version: change.version,
                                    previewHash: change.previewHash,
                                })
                            }
                        >
                            {isPagePublication(change)
                                ? "Approve publication"
                                : isPageCreation(change)
                                  ? "Approve creation of unpublished page"
                                  : copy.approve}
                        </Button>
                        <Button
                            className="min-h-11"
                            variant="outline"
                            disabled={working}
                            onClick={() =>
                                act({
                                    action: "reject",
                                    version: change.version,
                                })
                            }
                        >
                            {copy.reject}
                        </Button>
                    </>
                )}
                {(change.state.kind === "uncertain" ||
                    change.state.kind === "applying") && (
                    <Button
                        className="min-h-11"
                        disabled={working}
                        onClick={() => act({ action: "reconcile" })}
                    >
                        {copy.recover}
                    </Button>
                )}
                {((isPageCreation(change) && change.state.kind === "applied") ||
                    (isPagePublication(change) &&
                        ["proposed", "stale", "failed", "rejected"].includes(
                            change.state.kind,
                        ))) && (
                    <Button
                        className="min-h-11"
                        variant="outline"
                        disabled={working}
                        onClick={() =>
                            act({
                                action: "prepare-publication",
                                version: change.version,
                            })
                        }
                    >
                        {isPageCreation(change)
                            ? "Review publication"
                            : "Refresh publication review"}
                    </Button>
                )}
                {change.state.kind === "applied" &&
                    !isPageCreation(change) &&
                    !isPagePublication(change) && (
                        <Button
                            className="min-h-11"
                            variant="outline"
                            disabled={working}
                            onClick={() =>
                                act({
                                    action: "revert",
                                    version: change.version,
                                })
                            }
                        >
                            {copy.undo}
                        </Button>
                    )}
                <Button
                    className="min-h-11"
                    variant="ghost"
                    disabled={working}
                    onClick={async () => {
                        setWorking(true);
                        try {
                            onChange(
                                (
                                    await feedbackRequest<{
                                        change: ContentChange;
                                    }>(
                                        `/api/content-changes/${encodeURIComponent(change.id)}`,
                                    )
                                ).change,
                            );
                        } catch {
                            setError(copy.loadFailed);
                        } finally {
                            setWorking(false);
                        }
                    }}
                >
                    {working ? copy.loading : copy.reload}
                </Button>
            </div>
            {!!change.history.length && (
                <details className="rounded-lg border p-4">
                    <summary className="cursor-pointer min-h-11">
                        {copy.previousVersions} ({change.history.length})
                    </summary>
                    <ol className="space-y-3">
                        {change.history.map((version) => (
                            <li key={version.version} className="border-t py-3">
                                {copy.version} {version.version}:{" "}
                                {version.summary}
                                <p className="text-sm text-muted-foreground">
                                    {version.preparedAt}
                                </p>
                            </li>
                        ))}
                    </ol>
                </details>
            )}
        </article>
    );
}
