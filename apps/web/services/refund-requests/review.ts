import { randomUUID } from "crypto";
import type GQLContext from "@/models/GQLContext";
import RefundRequest from "@/models/RefundRequest";
import { requireCondition } from "@/services/content-changes/errors";
import {
    refundReceipt,
    requireRefundMember,
    requireRefundOperator,
} from "./receipts";
import { readRefundClassEvidence } from "./booking";
import { approvedRefundAccessDecision, refundRouting } from "./policy";
import { preparePurchaseRefund } from "./provider-quote";
import {
    purchaseInput,
    refundRequestDependencies,
    type RefundRequestDependencies,
} from "./provider";
import { refundRequestView, refundReviewHash } from "./projection";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";

/** Save the reason before external reads so a provider failure does not erase the draft. */
export async function prepareRefundRequest(
    ctx: GQLContext,
    input: { invoiceId: string; reason: string },
    deps: RefundRequestDependencies = refundRequestDependencies,
) {
    requireRefundMember(ctx);
    return withAccountWrite(
        {
            domainId: String(ctx.subdomain._id),
            userId: ctx.user.userId,
            purpose: "refund-draft",
        },
        () => prepareRefundDraft(ctx, input, deps),
    );
}
async function prepareRefundDraft(
    ctx: GQLContext,
    input: { invoiceId: string; reason: string },
    deps: RefundRequestDependencies,
) {
    requireCondition(
        !ctx.memberMimic,
        "mimic_read_only",
        "Exit Member Mimic before making a refund request.",
        403,
    );
    const receipt = await refundReceipt(ctx, input.invoiceId);
    const key = {
        domain: ctx.subdomain._id,
        invoiceId: receipt.invoice.invoiceId,
    };
    await RefundRequest.init();
    let existing = await RefundRequest.findOne(key).lean();
    if (!existing) {
        const values = {
            ...key,
            requestId: randomUUID(),
            membershipId: receipt.invoice.membershipId,
            membershipSessionId: receipt.invoice.membershipSessionId,
            userId: receipt.membership.userId,
            productName: receipt.course?.title || "Purchase",
            reason: input.reason,
            state: "draft" as const,
            routing: "evidence-review" as const,
            assignedTo: "Al" as const,
            accessDecision: approvedRefundAccessDecision,
            access: "unchanged" as const,
            refund: { kind: "not-started" as const },
            revision: 0,
        };
        try {
            await RefundRequest.create({
                ...values,
                reviewHash: refundReviewHash(values),
            });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) throw error;
        }
        existing = await RefundRequest.findOne(key).lean();
    }
    requireCondition(
        existing && existing.userId === ctx.user.userId,
        "not_found",
        "Refund request not found.",
        404,
    );
    if (existing.state !== "draft") return refundRequestView(existing);
    const saved = await RefundRequest.updateOne(
        { ...key, revision: existing.revision, state: "draft" },
        { $set: { reason: input.reason }, $inc: { revision: 1 } },
    );
    requireCondition(
        saved.modifiedCount === 1,
        "conflict",
        "Your draft changed in another window. Keep your note and reload the saved request before trying again.",
        409,
    );
    return refreshRefundReview(ctx, existing.requestId, false, deps);
}

export async function refreshRefundReview(
    ctx: GQLContext,
    requestId: string,
    operator: boolean,
    deps: RefundRequestDependencies = refundRequestDependencies,
) {
    if (operator) requireRefundOperator(ctx);
    else requireRefundMember(ctx);
    requireCondition(
        !ctx.memberMimic,
        "mimic_read_only",
        "Exit Member Mimic before refreshing a refund review.",
        403,
    );
    const scope = {
        domain: ctx.subdomain._id,
        requestId,
        ...(operator ? {} : { userId: ctx.user.userId }),
    };
    const record = await RefundRequest.findOne(scope).lean();
    requireCondition(record, "not_found", "Refund request not found.", 404);
    requireCondition(
        !operator || record.state !== "draft",
        "not_found",
        "Submitted refund request not found.",
        404,
    );
    requireCondition(
        ["draft", "submitted", "review-required"].includes(record.state) &&
            record.refund.kind === "not-started",
        "conflict",
        "This refund already has a decision or provider attempt. Check its existing result.",
        409,
    );
    const receipt = await refundReceipt(ctx, record.invoiceId, operator);
    const evidence = await readRefundClassEvidence(ctx, receipt);
    const now = deps.now();
    const payment = purchaseInput(receipt);
    let quote: typeof record.quote;
    if (payment) {
        try {
            const result = await preparePurchaseRefund(
                await deps.client(ctx, payment.mode),
                payment,
                now,
            );
            if (result.kind === "ready") quote = result.quote;
        } catch {
            /* The persisted draft/review remains available; no provider details enter it. */
        }
    }
    const classEvidence =
        evidence.kind === "verified" ? evidence.evidence : undefined;
    const fields = {
        quote,
        quoteExpiresAt: quote
            ? new Date(now.getTime() + 10 * 60000)
            : undefined,
        classEvidence,
        accessDecision: approvedRefundAccessDecision,
        routing: quote
            ? refundRouting({
                  verifiedClassStart: classEvidence?.classStart,
                  classEvidenceUnknown: evidence.kind === "unknown",
                  requestedAt: record.submittedAt
                      ? new Date(record.submittedAt)
                      : now,
              })
            : ("evidence-review" as const),
    };
    const unset = {
        ...(quote ? {} : { quote: "", quoteExpiresAt: "" }),
        ...(classEvidence ? {} : { classEvidence: "" }),
    };
    const update = {
        routing: fields.routing,
        accessDecision: fields.accessDecision,
        ...(quote ? { quote, quoteExpiresAt: fields.quoteExpiresAt } : {}),
        ...(classEvidence ? { classEvidence } : {}),
        reviewHash: refundReviewHash({ ...record, ...fields }),
    };
    const updated = await RefundRequest.findOneAndUpdate(
        { ...scope, revision: record.revision, "refund.kind": "not-started" },
        {
            $set: update,
            ...(Object.keys(unset).length ? { $unset: unset } : {}),
            $inc: { revision: 1 },
        },
        { new: true },
    ).lean();
    requireCondition(
        updated,
        "conflict",
        "This review changed. Refresh it before deciding.",
        409,
    );
    return refundRequestView(updated, { operator, now });
}
