import { Constants } from "@courselit/common-models";
import {
    InvoiceModel as Invoice,
    MembershipModel as Membership,
} from "@/services/member-billing/models";
import User from "@/models/User";
import Booking from "@/models/RefundBookingEvidence";
import type { PurchaseAccessResult } from "../../../../packages/common-models/src/purchase-access";
import { PurchaseAccessModel } from "../../../../packages/common-logic/src/purchase-access/model";
import { endFullyRefundedPurchase } from "../../../../packages/common-logic/src/purchase-access/end";
import {
    purchaseAccessKey,
    withPurchaseAccessObservation,
} from "../../../../packages/common-logic/src/purchase-access/gate";
import { withAccountWrite } from "../../../../packages/common-logic/src/account-lifecycle/gate";
import { toStripeAmount } from "@/payments-new/stripe-currency";
import {
    allChargeRefunds,
    refundSnapshot,
} from "@/payments-new/cancellation/validation";
import { provePurchasePayment } from "./provider-proof";
import { requireRefund, type PurchaseRefundClient } from "./provider-types";

/** Re-read original payment and complete current history. Never issue money here. */
export async function reconcilePurchaseRefundAccess(
    domainId: string,
    invoiceId: string,
    client: PurchaseRefundClient,
    verifiedMode?: "test" | "live",
    alreadyReserved = false,
): Promise<PurchaseAccessResult> {
    const invoice = await Invoice.findOne({
        domain: domainId,
        invoiceId,
        status: "paid",
        paymentProcessor: "stripe",
    }).lean();
    requireRefund(
        invoice?.paymentProcessorTransactionId,
        "access-payment-unavailable",
    );
    const mode = invoice.paymentMode || verifiedMode;
    requireRefund(
        mode && (!verifiedMode || verifiedMode === mode),
        "access-payment-mode-unavailable",
    );
    if (!invoice.paymentProcessorTransactionId.startsWith("cs_"))
        return "unchanged";
    const session = await client.checkout.sessions.retrieve(
        invoice.paymentProcessorTransactionId,
    );
    requireRefund(
        session.id === invoice.paymentProcessorTransactionId,
        "access-payment-mismatch",
    );
    if (session.mode === "subscription") return "unchanged";
    const member = await Membership.findOne({
        domain: domainId,
        membershipId: invoice.membershipId,
    }).lean();
    requireRefund(member, "access-membership-unavailable");
    if (
        member.entityType !== Constants.MembershipEntityType.COURSE ||
        member.isIncludedInPlan
    )
        return "review-required";
    if (!(await User.exists({ domain: domainId, userId: member.userId })))
        return "unchanged";
    return withAccountWrite(
        {
            domainId,
            userId: member.userId,
            purpose: "purchase-refund-access",
            allowInactive: true,
        },
        async () => {
            const key = {
                domainId,
                userId: member.userId,
                courseId: member.entityId,
                membershipId: invoice.membershipId,
                membershipSessionId: invoice.membershipSessionId,
            };
            const observe = async (): Promise<PurchaseAccessResult> => {
                const { charge } = await provePurchasePayment(client, {
                    invoiceId,
                    membershipId: invoice.membershipId,
                    membershipSessionId: invoice.membershipSessionId,
                    checkoutSessionId: invoice.paymentProcessorTransactionId!,
                    paidAmount: toStripeAmount(
                        invoice.amount,
                        invoice.currencyISOCode,
                    ),
                    currency: invoice.currencyISOCode.toLowerCase(),
                    mode,
                });
                const refunds = refundSnapshot(
                    await allChargeRefunds(client, charge.id),
                    charge.currency,
                );
                requireRefund(
                    new Set(refunds.map((refund) => refund.id)).size ===
                        refunds.length,
                    "access-refund-history-mismatch",
                );
                const succeeded = refunds.filter(
                    (refund) => refund.status === "succeeded",
                );
                const total = succeeded.reduce(
                    (sum, refund) => sum + refund.amount,
                    0,
                );
                requireRefund(
                    total <= charge.amount,
                    "access-refund-history-incomplete",
                );
                if (total !== charge.amount) {
                    const previous = await PurchaseAccessModel.findOne({
                        ...purchaseAccessKey(key),
                        state: { $ne: "open" },
                    }).lean();
                    if (!previous) return "unchanged";
                    // A bank return needs deliberate recovery, never invented enrollment.
                    await PurchaseAccessModel.updateOne(
                        { _id: previous._id },
                        {
                            $set: {
                                financialReviewRequired: true,
                                updatedAt: new Date(),
                            },
                        },
                    );
                    return "review-required";
                }
                requireRefund(
                    total === charge.amount_refunded,
                    "access-refund-history-incomplete",
                );
                // A second paid order sharing a legacy session is not proof that its entitlement was refunded.
                if (
                    await Invoice.exists({
                        domain: domainId,
                        membershipId: key.membershipId,
                        membershipSessionId: key.membershipSessionId,
                        status: "paid",
                        invoiceId: { $ne: invoiceId },
                    })
                )
                    return "review-required";
                return endFullyRefundedPurchase(
                    key,
                    {
                        invoiceId,
                        chargeId: charge.id,
                        mode,
                        paidAmount: charge.amount,
                        currency: charge.currency,
                        refundIds: succeeded.map((refund) => refund.id),
                        observedAt: new Date(),
                    },
                    async () =>
                        !!(await Booking.exists({
                            domain: domainId,
                            invoiceId,
                            userId: key.userId,
                            membershipId: key.membershipId,
                            membershipSessionId: key.membershipSessionId,
                        })),
                );
            };
            return alreadyReserved
                ? observe()
                : withPurchaseAccessObservation(key, observe);
        },
    );
}
