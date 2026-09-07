import {
    InvoiceModel,
    MembershipModel,
} from "@/services/member-billing/models";
import Binding from "@/models/StripeSubscriptionBinding";
import RefundLedger from "@/models/StripeChargeRefunds";
import BillingCancellation from "@/models/BillingCancellation";
import RefundRequest from "@/models/RefundRequest";
import type { PurchaseRemoval } from "../../../../packages/common-models/src/purchase-removal";

export const financialHistoryRemovalMessage =
    "This item has financial records or a provider subscription. Keep its history for payment and refund reconciliation. Ask support to review it before removing it.";

export async function protectedFinancialMemberships(
    domainId: string,
    membershipIds: string[],
) {
    if (!membershipIds.length) return new Set<string>();
    const scope = { domain: domainId, membershipId: { $in: membershipIds } };
    const evidence = await Promise.all([
        InvoiceModel.find({ ...scope, paymentProcessor: { $ne: "synthetic" } })
            .select("membershipId")
            .lean(),
        MembershipModel.find({
            ...scope,
            subscriptionId: { $exists: true, $nin: [null, ""] },
        })
            .select("membershipId")
            .lean(),
        Binding.find(scope).select("membershipId").lean(),
        RefundLedger.find(scope).select("membershipId").lean(),
        BillingCancellation.find(scope).select("membershipId").lean(),
        RefundRequest.find(scope).select("membershipId").lean(),
    ]);
    return new Set(
        evidence.flatMap((rows) => rows.map((item) => item.membershipId)),
    );
}

export function purchaseRemoval(
    isTest: boolean,
    protectedMembership: boolean,
    sessionMatches: boolean,
): PurchaseRemoval {
    if (!isTest) return { kind: "blocked", reason: "live-payment" };
    if (protectedMembership)
        return { kind: "blocked", reason: "financial-history" };
    if (!sessionMatches)
        return { kind: "blocked", reason: "membership-changed" };
    return { kind: "allowed" };
}

/** Financial receipts must survive even before a delayed provider callback creates its binding. */
export async function requireNoFinancialDeletion(
    domainId: string,
    membershipIds: string[],
) {
    if ((await protectedFinancialMemberships(domainId, membershipIds)).size)
        throw new Error(financialHistoryRemovalMessage);
}
