import type GQLContext from "@/models/GQLContext";
import RefundRequest from "@/models/RefundRequest";
import { requireCondition } from "@/services/content-changes/errors";
import { requireRefundMember, refundReceipt } from "./receipts";
import { readRefundClassEvidence } from "./booking";
import { approvedRefundAccessDecision, refundRouting } from "./policy";
import { refundRequestView, refundReviewHash } from "./projection";
import {
    refundRequestDependencies,
    type RefundRequestDependencies,
} from "./provider";
import { applyRefundRequest } from "./apply";

export async function submitRefundRequest(
    ctx: GQLContext,
    input: { requestId: string; reviewHash: string },
    deps: RefundRequestDependencies = refundRequestDependencies,
) {
    requireRefundMember(ctx);
    requireCondition(
        !ctx.memberMimic,
        "mimic_read_only",
        "Exit Member Mimic before submitting a request.",
        403,
    );
    const scope = {
        domain: ctx.subdomain._id,
        userId: ctx.user.userId,
        requestId: input.requestId,
    };
    const record = await RefundRequest.findOne(scope).lean();
    requireCondition(record, "not_found", "Refund request not found.", 404);
    if (record.state !== "draft") return refundRequestView(record);
    requireCondition(
        record.reviewHash === input.reviewHash,
        "conflict",
        "The review changed. Read it again.",
        409,
    );
    const receipt = await refundReceipt(ctx, record.invoiceId);
    const evidence = await readRefundClassEvidence(ctx, receipt);
    const now = deps.now();
    requireCondition(
        record.accessDecision === approvedRefundAccessDecision,
        "conflict",
        "The access policy changed. Review the request again before submitting.",
        409,
    );
    requireCondition(
        record.classEvidence
            ? evidence.kind === "verified" &&
                  evidence.evidence.revision ===
                      record.classEvidence.revision &&
                  evidence.evidence.classStart.getTime() ===
                      new Date(record.classEvidence.classStart).getTime()
            : evidence.kind !== "verified",
        "conflict",
        "The class booking changed. Review the request again before submitting.",
        409,
    );
    const routing = record.quote
        ? refundRouting({
              verifiedClassStart:
                  evidence.kind === "verified"
                      ? evidence.evidence.classStart
                      : undefined,
              classEvidenceUnknown: evidence.kind === "unknown",
              requestedAt: now,
          })
        : "evidence-review";
    const automatic =
        routing === "class-automatic" &&
        approvedRefundAccessDecision !== "policy-pending";
    if (automatic)
        requireCondition(
            record.quote &&
                record.quoteExpiresAt &&
                record.quoteExpiresAt > now,
            "conflict",
            "The payment review expired. Refresh it before confirming.",
            409,
        );
    const fields = {
        submittedAt: now,
        routing,
        state: automatic ? ("approved" as const) : ("submitted" as const),
        accessDecision: approvedRefundAccessDecision,
        ...(automatic
            ? {
                  access: "pending" as const,
                  decision: {
                      kind: "approved" as const,
                      policy: "class-at-least-14-days",
                      actorUserId: "policy:class-14-days",
                      explanation:
                          "The verified class starts at least 14 days after this request.",
                      at: now,
                      reviewHash: record.reviewHash,
                  },
              }
            : {}),
    };
    const updated = await RefundRequest.findOneAndUpdate(
        {
            ...scope,
            revision: record.revision,
            state: "draft",
            reviewHash: input.reviewHash,
        },
        {
            $set: {
                ...fields,
                reviewHash: refundReviewHash({ ...record, ...fields }),
            },
            $inc: { revision: 1 },
            ...(fields.decision
                ? { $push: { decisionHistory: fields.decision } }
                : {}),
        },
        { new: true },
    ).lean();
    if (!updated) {
        const winner = await RefundRequest.findOne(scope).lean();
        requireCondition(winner, "not_found", "Refund request not found.", 404);
        return refundRequestView(winner);
    }
    return automatic
        ? applyRefundRequest(ctx, updated.requestId, false, deps)
        : refundRequestView(updated);
}
