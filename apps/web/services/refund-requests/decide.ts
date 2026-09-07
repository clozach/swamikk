import type GQLContext from "@/models/GQLContext";
import RefundRequest from "@/models/RefundRequest";
import { requireCondition } from "@/services/content-changes/errors";
import { requireRefundOperator } from "./receipts";
import { refundRequestView, refundReviewHash } from "./projection";
import {
    refundRequestDependencies,
    type RefundRequestDependencies,
} from "./provider";
import { applyRefundRequest } from "./apply";

export async function decideRefundRequest(
    ctx: GQLContext,
    input: {
        action: "approve" | "decline" | "escalate";
        requestId: string;
        reviewHash: string;
        explanation: string;
    },
    deps: RefundRequestDependencies = refundRequestDependencies,
) {
    requireRefundOperator(ctx);
    const scope = { domain: ctx.subdomain._id, requestId: input.requestId };
    const record = await RefundRequest.findOne(scope).lean();
    requireCondition(
        record && record.state !== "draft",
        "not_found",
        "Submitted refund request not found.",
        404,
    );
    requireCondition(
        ["submitted", "review-required"].includes(record.state) &&
            record.refund.kind === "not-started" &&
            record.reviewHash === input.reviewHash,
        "conflict",
        "This request changed. Review its existing decision or refund.",
        409,
    );
    const now = deps.now();
    const view = refundRequestView(record, { operator: true, now });
    if (input.action === "approve")
        requireCondition(
            view.canApprove,
            "needs_review",
            "A current payment and consequence review is required before approval.",
            409,
        );
    const fields =
        input.action === "escalate"
            ? {
                  assignedTo: "KK" as const,
                  escalation: {
                      actorUserId: ctx.user.userId,
                      explanation: input.explanation,
                      at: now,
                  },
              }
            : {
                  state:
                      input.action === "approve"
                          ? ("approved" as const)
                          : ("declined" as const),
                  access:
                      input.action === "approve"
                          ? ("pending" as const)
                          : ("unchanged" as const),
                  decision: {
                      kind:
                          input.action === "approve"
                              ? ("approved" as const)
                              : ("declined" as const),
                      policy: record.routing,
                      actorUserId: ctx.user.userId,
                      explanation: input.explanation,
                      at: now,
                      reviewHash: input.reviewHash,
                  },
              };
    const updated = await RefundRequest.findOneAndUpdate(
        {
            ...scope,
            revision: record.revision,
            reviewHash: input.reviewHash,
            "refund.kind": "not-started",
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
    requireCondition(
        updated,
        "conflict",
        "Another reviewer changed this request. Refresh it.",
        409,
    );
    return input.action === "approve"
        ? applyRefundRequest(ctx, updated.requestId, true, deps)
        : refundRequestView(updated, { operator: true });
}
