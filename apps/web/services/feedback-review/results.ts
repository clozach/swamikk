import type { FeedbackReviewResult } from "@courselit/common-models";
import type { InternalFeedback } from "@courselit/orm-models";
import { FeedbackModel } from "../content-changes/models";
import { retainReviewerProposal } from "../content-changes/reviewer-proposal";
import { fingerprint } from "../content-changes/stable";
import {
    ContentChangeError,
    requireCondition,
} from "../content-changes/errors";
import { prepareReviewIntent } from "./prepare";
import { resolvePublicContext, reviewInputHash } from "./context";
import {
    liveAuthority,
    readLease,
    requireUnexpired,
    withFeedbackAccount,
    leaseFilter,
} from "./leases";
import type { ReviewerAuthority } from "./authority";
export const resultView = (record: InternalFeedback) => {
    const review = record.automaticReview!;
    requireCondition(
        "intent" in review,
        "no_result",
        "No result has been accepted.",
        409,
    );
    return {
        feedbackId: record.id,
        generation: review.generation,
        state: review.kind,
        outcome: review.intent.result.kind,
        ...(review.intent.proposal
            ? { proposalId: review.intent.proposal.id }
            : {}),
    };
};
/** Complete only the already accepted intent. Never regenerate content or reset a proposal. */
export async function finishReviewIntent(
    record: InternalFeedback,
    authority: ReviewerAuthority,
) {
    const review = record.automaticReview!;
    requireCondition(
        "intent" in review,
        "no_result",
        "No result has been accepted.",
        409,
    );
    if (review.kind === "done") return resultView(record);
    await liveAuthority(authority);
    const current = await FeedbackModel.findOne({
        ...leaseFilter(record),
        "automaticReview.intent.id": review.intent.id,
        "automaticReview.intent.resultHash": review.intent.resultHash,
    });
    requireCondition(
        current,
        "lease_conflict",
        "The accepted feedback result is no longer available.",
        409,
    );
    if (review.intent.proposal)
        await retainReviewerProposal(
            authority.domainId,
            review.intent.proposal,
        );
    const completed = await FeedbackModel.findOneAndUpdate(
        {
            ...leaseFilter(record),
            "automaticReview.intent.id": review.intent.id,
            "automaticReview.intent.resultHash": review.intent.resultHash,
        },
        {
            $set: {
                "automaticReview.kind": "done",
                "automaticReview.completedAt": new Date().toISOString(),
            },
        },
        { new: true },
    );
    if (completed) return resultView(completed);
    const latest = await FeedbackModel.findOne({
        domain: authority.domainId,
        id: record.id,
        "automaticReview.generation": review.generation,
        "automaticReview.intent.resultHash": review.intent.resultHash,
        "automaticReview.kind": "done",
    });
    requireCondition(
        latest,
        "lease_conflict",
        "The result is retained; review its status before retrying.",
        409,
    );
    return resultView(latest);
}
export async function submitReviewResult(
    input: Parameters<typeof readLease>[0] & { result: FeedbackReviewResult },
    authority: ReviewerAuthority,
) {
    const record = await readLease(input, authority);
    return withFeedbackAccount(record, authority, async () => {
        try {
            const review = record.automaticReview!;
            if (review.kind !== "leased") {
                requireCondition(
                    review.intent.resultHash === fingerprint(input.result),
                    "result_conflict",
                    "A different result has already been accepted for this lease.",
                    409,
                );
                return await finishReviewIntent(record, authority);
            }
            requireUnexpired(review);
            const context = await resolvePublicContext(
                record,
                authority.grant.scopes,
            );
            requireCondition(
                reviewInputHash(record, context) === review.inputHash,
                "stale",
                "Feedback or public content changed. A fresh review is required.",
                409,
            );
            const intent = await prepareReviewIntent(
                record,
                context,
                input.result,
                authority,
            );
            await liveAuthority(authority);
            requireUnexpired(review);
            const accepted = await FeedbackModel.findOneAndUpdate(
                {
                    ...leaseFilter(record),
                    "automaticReview.leaseUntil": {
                        $gt: new Date().toISOString(),
                    },
                },
                {
                    $set: {
                        automaticReview: {
                            ...review,
                            kind: "submitting",
                            intent,
                        },
                    },
                },
                { new: true },
            );
            if (!accepted) {
                const latest = await readLease(input, authority);
                requireCondition(
                    latest.automaticReview?.kind !== "leased" &&
                        latest.automaticReview?.intent.resultHash ===
                            intent.resultHash,
                    "result_conflict",
                    "This lease accepted another result or expired.",
                    409,
                );
                return await finishReviewIntent(latest, authority);
            }
            return await finishReviewIntent(accepted, authority);
        } catch (error) {
            await FeedbackModel.updateOne(
                {
                    domain: authority.domainId,
                    id: record.id,
                    "automaticReview.generation":
                        record.automaticReview!.generation,
                    "automaticReview.leaseId": record.automaticReview!.leaseId,
                    "automaticReview.kind": { $in: ["leased", "submitting"] },
                },
                {
                    $set: {
                        "automaticReview.lastFailure": {
                            code:
                                error instanceof ContentChangeError
                                    ? error.code
                                    : "unavailable",
                            at: new Date().toISOString(),
                        },
                    },
                },
            ).catch(() => undefined);
            throw error;
        }
    });
}
