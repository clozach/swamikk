import { randomUUID } from "crypto";
import type { InternalFeedback } from "@courselit/orm-models";
import type { FeedbackReviewLease } from "@courselit/common-models";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import { FeedbackModel } from "../content-changes/models";
import { requireCondition } from "../content-changes/errors";
import { resolvePublicContext, reviewInputHash } from "./context";
import type { ReviewerAuthority } from "./authority";
import { requireIssuer } from "./grants";
export const REVIEW_LEASE_MS = 10 * 60_000;
export const eligibleFeedback = (domainId: string) => ({
    domain: domainId,
    state: "open",
    "actor.kind": { $in: ["visitor", "member"] },
    "photoMediaIds.0": { $exists: false },
});
export const leaseView = (record: InternalFeedback) => {
    const lease = record.automaticReview!;
    return {
        feedbackId: record.id,
        generation: lease.generation,
        leaseId: lease.leaseId,
        leaseUntil: lease.leaseUntil,
        inputHash: lease.inputHash,
    };
};
export async function liveAuthority(authority: ReviewerAuthority) {
    requireCondition(
        authority.grant.expiresAt.getTime() > Date.now(),
        "grant_expired",
        "The restricted review grant expired.",
        401,
    );
    await requireIssuer(
        authority.domainId,
        authority.grant.issuerUserId,
        authority.grant.scopes,
    );
}
export async function withFeedbackAccount<T>(
    record: InternalFeedback,
    authority: ReviewerAuthority,
    operation: () => Promise<T>,
) {
    if (
        record.actor.kind === "visitor" ||
        record.actor.userId === authority.grant.issuerUserId
    )
        return operation();
    return withAccountWrite(
        {
            domainId: authority.domainId,
            userId: record.actor.userId,
            purpose: "feedback-review-subject",
        },
        operation,
    );
}
export function leaseFilter(record: InternalFeedback) {
    return {
        ...eligibleFeedback(String(record.domain)),
        // Handling feedback does not cancel an already accepted proposal intent.
        // New acceptance still requires open feedback; receipts never reopen it.
        ...(record.automaticReview && record.automaticReview.kind !== "leased"
            ? { state: { $in: ["open", "closed"] } }
            : {}),
        id: record.id,
        text: record.text,
        target: { $eq: record.target },
        ...(record.automaticReview
            ? {
                  "automaticReview.generation":
                      record.automaticReview.generation,
                  "automaticReview.leaseId": record.automaticReview.leaseId,
                  "automaticReview.kind": record.automaticReview.kind,
              }
            : { automaticReview: { $exists: false } }),
    };
}
export async function readLease(
    input: {
        feedbackId: string;
        generation: number;
        leaseId: string;
        inputHash: string;
    },
    authority: ReviewerAuthority,
) {
    const record = await FeedbackModel.findOne({
        ...eligibleFeedback(authority.domainId),
        state: { $in: ["open", "closed"] },
        $or: [
            { state: "open" },
            { "automaticReview.kind": { $in: ["submitting", "done"] } },
        ],
        id: input.feedbackId,
        "automaticReview.grantId": authority.grant.id,
        "automaticReview.generation": input.generation,
        "automaticReview.leaseId": input.leaseId,
        "automaticReview.inputHash": input.inputHash,
    });
    requireCondition(
        record,
        "lease_conflict",
        "This feedback lease is no longer available.",
        409,
    );
    return record;
}
export function requireUnexpired(lease: FeedbackReviewLease) {
    requireCondition(
        new Date(lease.leaseUntil).getTime() > Date.now(),
        "lease_expired",
        "This review lease expired. Claim a fresh review.",
        409,
    );
}
export async function claimNew(
    record: InternalFeedback,
    authority: ReviewerAuthority,
) {
    return withFeedbackAccount(record, authority, async () => {
        const context = await resolvePublicContext(
            record,
            authority.grant.scopes,
        );
        await liveAuthority(authority);
        const now = Date.now();
        const lease: FeedbackReviewLease = {
            grantId: authority.grant.id,
            generation: (record.automaticReview?.generation || 0) + 1,
            leaseId: randomUUID(),
            leaseUntil: new Date(
                Math.min(
                    now + REVIEW_LEASE_MS,
                    authority.grant.expiresAt.getTime(),
                ),
            ).toISOString(),
            context,
            inputHash: reviewInputHash(record, context),
        };
        const claimed = await FeedbackModel.findOneAndUpdate(
            leaseFilter(record),
            { $set: { automaticReview: { ...lease, kind: "leased" } } },
            { new: true },
        );
        return claimed ? { claim: leaseView(claimed) } : null;
    });
}
export async function readReviewContext(
    input: Parameters<typeof readLease>[0],
    authority: ReviewerAuthority,
) {
    const record = await readLease(input, authority);
    return withFeedbackAccount(record, authority, async () => {
        const lease = record.automaticReview!;
        requireCondition(
            lease.kind === "leased",
            "result_accepted",
            "A result was already accepted; retrieve its result instead.",
            409,
        );
        requireUnexpired(lease);
        const context = await resolvePublicContext(
            record,
            authority.grant.scopes,
        );
        requireCondition(
            reviewInputHash(record, context) === lease.inputHash,
            "stale",
            "Feedback or public content changed. Claim a fresh review after this lease expires.",
            409,
        );
        await liveAuthority(authority);
        requireUnexpired(lease);
        return {
            ...leaseView(record),
            feedback: { text: record.text, trust: "untrusted-user-input" },
            context,
        };
    });
}
