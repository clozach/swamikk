import type { InternalRefundRequest } from "@/models/RefundRequest";
import { requireCondition } from "@/services/content-changes/errors";
import type { PurchaseRefundClient } from "./provider-types";
import { reconcilePurchaseRefundAccess } from "./access-evidence";
import {
    MembershipModel,
    InvoiceModel,
} from "@/services/member-billing/models";
import User from "@/models/User";
import { withPurchaseAccessObservation } from "../../../../packages/common-logic/src/purchase-access/gate";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";

export function requireApprovedRefundAccess(record: InternalRefundRequest) {
    requireCondition(
        ["preserve-access", "end-refunded-access"].includes(
            record.accessDecision,
        ),
        "needs_review",
        "The access consequence needs an approved implementation before a refund can be applied.",
        409,
    );
}
export async function applyRefundAccess(
    record: InternalRefundRequest,
    client: PurchaseRefundClient,
) {
    requireApprovedRefundAccess(record);
    return reconcilePurchaseRefundAccess(
        String(record.domain),
        record.invoiceId,
        client,
        undefined,
        true,
    );
}

export async function supportedPurchaseAccessTarget(
    domainId: string,
    invoiceId: string,
    membershipId: string,
    sessionId: string,
) {
    const member = await MembershipModel.findOne({
        domain: domainId,
        membershipId,
        entityType: "course",
        isIncludedInPlan: { $ne: true },
    }).lean();
    if (!member) return false;
    return !(await InvoiceModel.exists({
        domain: domainId,
        membershipId,
        membershipSessionId: sessionId,
        invoiceId: { $ne: invoiceId },
        status: { $in: ["paid", "pending"] },
    }));
}

export async function withRefundAccessObservation<T>(
    record: InternalRefundRequest,
    operation: () => Promise<T>,
): Promise<T> {
    const domainId = String(record.domain);
    const member = await MembershipModel.findOne({
        domain: domainId,
        membershipId: record.membershipId,
        userId: record.userId,
        entityType: "course",
    }).lean();
    if (
        !member ||
        !(await User.exists({ domain: domainId, userId: record.userId }))
    )
        return operation();
    return withAccountWrite(
        {
            domainId,
            userId: record.userId,
            purpose: "native-refund-observation",
            allowInactive: true,
        },
        () =>
            withPurchaseAccessObservation(
                {
                    domainId,
                    userId: record.userId,
                    courseId: member.entityId,
                    membershipId: record.membershipId,
                    membershipSessionId: record.membershipSessionId,
                },
                operation,
            ),
    );
}
