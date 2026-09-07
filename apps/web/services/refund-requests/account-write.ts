import type GQLContext from "@/models/GQLContext";
import User from "@/models/User";
import RefundRequest from "@/models/RefundRequest";
import { refundReceipt, requireRefundOperator } from "./receipts";
import { requireCondition } from "@/services/content-changes/errors";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";

/** Support can reconcile a retained attempt after erasure, but cannot initiate a new one. */
export async function withRefundOperatorWrite<T>(
    ctx: GQLContext,
    input: { action: string; requestId?: string; invoiceId?: string },
    operation: () => Promise<T>,
) {
    requireRefundOperator(ctx);
    const record = input.requestId
        ? await RefundRequest.findOne({
              domain: ctx.subdomain._id,
              requestId: input.requestId,
          }).lean()
        : null;
    const userId =
        record?.userId ||
        (input.invoiceId
            ? (await refundReceipt(ctx, input.invoiceId, true)).membership
                  .userId
            : undefined);
    requireCondition(userId, "not_found", "Refund request not found.", 404);
    return withAccountWrite(
        {
            domainId: String(ctx.subdomain._id),
            userId: ctx.user.userId,
            purpose: "refund-operator",
        },
        async () => {
            const member = await User.exists({
                domain: ctx.subdomain._id,
                userId,
            });
            if (!member) {
                requireCondition(
                    input.action === "reconcile" &&
                        record &&
                        record.state !== "draft" &&
                        record.refund.kind !== "not-started",
                    "account_closed",
                    "This account is closed. Only its existing provider attempt can be reconciled.",
                    409,
                );
                return operation();
            }
            return withAccountWrite(
                {
                    domainId: String(ctx.subdomain._id),
                    userId,
                    purpose: "refund-review",
                    allowInactive: true,
                },
                operation,
            );
        },
    );
}
