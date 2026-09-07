import {
    readUserRefundEvidence,
    withObservedRefund,
    refundEvidenceNeedsAttention,
} from "@/payments-new/stripe-lifecycle/refund-projection";
import { createHash } from "crypto";
import type GQLContext from "@/models/GQLContext";
import type { InternalUser } from "@courselit/orm-models";
import BillingCancellation from "@/models/BillingCancellation";
import RefundRequest from "@/models/RefundRequest";
import {
    MembershipModel,
    InvoiceModel,
} from "@/services/member-billing/models";
import { AccountLifecycleModel } from "../../../../packages/common-logic/src/account-lifecycle/model";
import { requireCondition } from "@/services/content-changes/errors";
import { hasConfirmedSubscriptionEnd } from "@/payments-new/stripe-lifecycle/subscription";
import { Constants } from "@courselit/common-models";
import { internal } from "@/config/strings";

export type ClosureBlocker = {
    kind: "membership" | "financial" | "owner" | "checkout";
    message: string;
    href: string;
};
export async function accountClosureReview(
    user: InternalUser,
    ctx: GQLContext,
) {
    const scope = { domain: ctx.subdomain._id, userId: user.userId };
    const [
        memberships,
        storedCancellations,
        storedRefunds,
        lifecycle,
        refundEvidence,
    ] = await Promise.all([
        MembershipModel.find(scope).lean(),
        BillingCancellation.find(scope).lean(),
        RefundRequest.find(scope).lean(),
        AccountLifecycleModel.findOne(scope).lean(),
        readUserRefundEvidence(String(ctx.subdomain._id), user.userId),
    ]);
    const cancellations = storedCancellations.map((record) =>
        withObservedRefund(record, refundEvidence),
    );
    const refunds = storedRefunds.map((record) =>
        withObservedRefund(record, refundEvidence),
    );
    const blockers: ClosureBlocker[] = [];
    const externalEnds = new Set(
        (
            await Promise.all(
                memberships.map(async (member) =>
                    member.subscriptionId &&
                    (await hasConfirmedSubscriptionEnd(
                        String(ctx.subdomain._id),
                        member.membershipId,
                        member.sessionId,
                        member.subscriptionId,
                    ))
                        ? `${member.membershipId}:${member.sessionId}`
                        : null,
                ),
            )
        ).filter(Boolean),
    );
    const pendingInvoices = await InvoiceModel.find({
        domain: ctx.subdomain._id,
        membershipId: { $in: memberships.map((item) => item.membershipId) },
        status: "pending",
    })
        .select("invoiceId membershipId membershipSessionId")
        .lean();
    const creatorIds = memberships
        .filter(
            (member) =>
                member.entityType ===
                    Constants.MembershipEntityType.COMMUNITY &&
                member.role === Constants.MembershipRole.MODERATE &&
                member.joiningReason === internal.joining_reason_creator,
        )
        .map((member) => member.membershipId);
    const creatorReceipt = creatorIds.length
        ? await InvoiceModel.exists({
              domain: ctx.subdomain._id,
              membershipId: { $in: creatorIds },
          })
        : null;
    if (pendingInvoices.length)
        blockers.push({
            kind: "checkout",
            message:
                "A checkout is still awaiting confirmation. Finish it or ask support to verify its outcome before closing your account.",
            href: "/p/contact",
        });
    if (user.email === ctx.subdomain.email || creatorReceipt)
        blockers.push({
            kind: "owner",
            message: creatorReceipt
                ? "A community ownership handover needs support review to preserve your receipt records before closing this account."
                : "The site owner account needs an ownership handover before it can be closed.",
            href: "/p/contact",
        });
    if (
        memberships.some(
            (member) =>
                member.subscriptionId &&
                !externalEnds.has(
                    `${member.membershipId}:${member.sessionId}`,
                ) &&
                !cancellations.some(
                    (operation) =>
                        operation.membershipId === member.membershipId &&
                        operation.membershipSessionId === member.sessionId &&
                        operation.cancellation.kind === "canceled" &&
                        operation.access === "ended",
                ),
        )
    )
        blockers.push({
            kind: "membership",
            message:
                "Review and cancel your subscription before closing your account. Account deletion does not cancel a payment provider subscription.",
            href: "/dashboard/membership",
        });
    const settledRefund = (refund: any) =>
        refund.kind === "result" &&
        (refund.result.kind === "not-required" ||
            (refund.result.kind === "refund" &&
                refund.result.status === "succeeded"));
    if (
        refundEvidence.some(refundEvidenceNeedsAttention) ||
        cancellations.some(
            (item) =>
                item.cancellation.kind !== "quoted" &&
                (item.cancellation.kind !== "canceled" ||
                    item.access !== "ended" ||
                    !settledRefund(item.refund)),
        ) ||
        refunds.some(
            (item) =>
                ["submitted", "approved", "review-required"].includes(
                    item.state,
                ) ||
                item.claim ||
                (item.refund.kind !== "not-started" &&
                    !settledRefund(item.refund)),
        )
    )
        blockers.push({
            kind: "financial",
            message:
                "A cancellation or refund still needs attention. Resolve it with support before account data is erased.",
            href: "/p/contact",
        });
    const facts = {
        refundEvidence: refundEvidence.map((item) => [
            item.chargeId,
            item.revision,
            item.claim?.id || null,
        ]),
        pendingInvoices: pendingInvoices.map((item) => item.invoiceId),
        userId: user.userId,
        permissions: user.permissions,
        memberships: memberships.map((item) => [
            item.membershipId,
            item.sessionId,
            item.status,
            item.subscriptionId,
        ]),
        cancellations: cancellations.map((item) => [
            item.operationId,
            item.revision,
        ]),
        refunds: refunds.map((item) => [item.requestId, item.revision]),
        blockers: blockers.map((item) => item.kind),
    };
    return {
        kind: "review" as const,
        blockers,
        reviewHash: createHash("sha256")
            .update(JSON.stringify(facts))
            .digest("hex"),
        state: lifecycle?.state || "active",
        pendingWrites: lifecycle?.writes.length || 0,
    };
}
export async function requireClosureFinanciallyReady(
    user: InternalUser,
    ctx: GQLContext,
) {
    const review = await accountClosureReview(user, ctx);
    requireCondition(
        review.blockers.length === 0,
        "needs_review",
        review.blockers[0]?.message || "Review account closure first.",
        409,
    );
    return review;
}
