import type { FeedbackReviewIntent } from "@courselit/common-models";
import { ContentChangeModel } from "./models";
import { requireCondition } from "./errors";
import { stableJson } from "./stable";
/** Server-only completion of a durably accepted restricted-review intent. No approval. */
export async function retainReviewerProposal(
    domainId: string,
    proposal: NonNullable<FeedbackReviewIntent["proposal"]>,
) {
    requireCondition(
        proposal.version.version === 1 &&
            proposal.version.preparedBy ===
                `feedback-review:${proposal.provenance.grantId}` &&
            proposal.id ===
                `review-${proposal.provenance.feedbackId}-${proposal.provenance.generation}` &&
            ["lesson", "page-widget"].includes(proposal.target.kind),
        "forbidden",
        "Invalid restricted proposal intent.",
        403,
    );
    await ContentChangeModel.init();
    await ContentChangeModel.updateOne(
        { domain: domainId, id: proposal.id },
        {
            $setOnInsert: {
                domain: domainId,
                id: proposal.id,
                target: proposal.target,
                feedbackId: proposal.provenance.feedbackId,
                provenance: proposal.provenance,
                ...proposal.version,
                state: { kind: "proposed" },
                history: [],
                approvals: [],
            },
        },
        { upsert: true },
    );
    const saved = await ContentChangeModel.findOne({
        domain: domainId,
        id: proposal.id,
    });
    requireCondition(
        saved &&
            stableJson(saved.provenance) === stableJson(proposal.provenance),
        "result_conflict",
        "The retained result identity conflicts. Administrator review is required.",
        409,
    );
    // Later administrator revisions/approval are retained; a retry never resets them.
    return saved.id;
}
