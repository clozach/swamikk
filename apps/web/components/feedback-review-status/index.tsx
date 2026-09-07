"use client";

import { useContext } from "react";
import Link from "next/link";
import type { ContextualFeedback } from "@courselit/common-models";
import { checkPermission } from "@courselit/utils";
import { ProfileContext } from "@/components/contexts";
import { useMemberMimic } from "@/components/member-mimic/context";
import { FEEDBACK_ADMIN_PERMISSIONS } from "@ui-config/constants";
import { feedbackUi as copy } from "@config/strings";

type Feedback = Pick<
    ContextualFeedback,
    "state" | "actor" | "photoMediaIds" | "review"
>;

/** Read-only status from the existing sanitized administrator feedback response. */
export default function FeedbackReviewStatus({
    feedback,
}: {
    feedback: Feedback;
}) {
    const { profile } = useContext(ProfileContext);
    const mimic = useMemberMimic();
    if (
        mimic.kind !== "inactive" ||
        !profile?.permissions ||
        !checkPermission(profile.permissions, FEEDBACK_ADMIN_PERMISSIONS)
    )
        return null;

    const review = feedback.review;
    let title: string, guidance: string;
    let proposalId: string | undefined;
    if (!review) {
        if (feedback.actor.kind === "admin" || feedback.photoMediaIds.length) {
            title = "Human review only";
            guidance = `Administrator comments and photos are excluded from automatic review. ${copy.savedPrompt} remains available.`;
        } else if (feedback.state === "closed") {
            title = "No automatic review recorded";
            guidance = "This comment is marked handled.";
        } else {
            title = "Awaiting review";
            guidance = `No automatic review has been recorded. Use ${copy.savedPrompt} for manual review.`;
        }
    } else if (
        review.kind === "done" &&
        review.outcome === "text-proposal" &&
        review.proposalId
    ) {
        title = "Draft retained";
        guidance = "Open the proposal to see its current approval status.";
        proposalId = review.proposalId;
    } else if (review.kind === "done" && review.outcome === "escalation") {
        title = "Needs human review";
        guidance = `Review the note below. Use ${copy.savedPrompt} for manual review.`;
    } else if (review.lastFailure) {
        title = "Review needs attention";
        guidance =
            review.kind === "submitting"
                ? `The result is retained, but saving its draft or receipt was not confirmed. Choose ${copy.reload} before asking the reviewer to retry the same saved result.`
                : `No result has been recorded. Choose ${copy.reload} before retrying, or use ${copy.savedPrompt} for manual review.`;
    } else if (review.kind === "submitting") {
        title = "Result awaiting confirmation";
        guidance = `The result is retained. Choose ${copy.reload} to check whether its draft or receipt has been saved.`;
    } else if (review.kind === "leased") {
        title = "Review started";
        guidance = `No result has been recorded yet. Choose ${copy.reload} to check for an update.`;
    } else {
        title = "Review status unavailable";
        guidance = `Choose ${copy.reload} before continuing. ${copy.savedPrompt} remains available.`;
    }

    return (
        <section
            aria-label="Automatic review status"
            className="mt-4 rounded-lg border bg-muted/20 p-4 text-sm"
        >
            <p className="font-medium">{title}</p>
            <p className="mt-1 text-muted-foreground">{guidance}</p>
            {review?.summary && (
                <p className="mt-3 whitespace-pre-wrap break-words">
                    {review.summary}
                </p>
            )}
            {proposalId && (
                <Link
                    href={`/dashboard/changes?id=${encodeURIComponent(proposalId)}`}
                    className="mt-2 inline-flex min-h-11 max-w-full items-center break-all underline underline-offset-4"
                >
                    Open proposal {proposalId}
                </Link>
            )}
        </section>
    );
}
