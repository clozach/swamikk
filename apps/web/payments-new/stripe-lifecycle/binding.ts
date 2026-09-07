import type Stripe from "stripe";
import mongoose from "mongoose";
import Binding from "@/models/StripeSubscriptionBinding";
import Membership from "@/models/Membership";
import Invoice from "@/models/Invoice";
import PaymentPlan from "@/models/PaymentPlan";
import { providerId, requireStripeFact } from "./errors";
import { includedMembershipId } from "../../../../packages/common-logic/src/member-access/included-membership-id";

/** Establish only a provable current session. Existing immutable bindings survive rejoins. */
export async function bindSubscription(
    domainId: string,
    subscription: Stripe.Subscription,
    mode: "test" | "live",
    orderId?: string,
) {
    requireStripeFact(
        subscription.livemode === (mode === "live"),
        "subscription-mode-mismatch",
    );
    const key = { domain: domainId, mode, subscriptionId: subscription.id };
    const existing = await Binding.findOne(key).lean();
    if (existing) {
        requireStripeFact(
            existing.customerId === providerId(subscription.customer),
            "subscription-customer-mismatch",
        );
        if (orderId)
            requireStripeFact(
                existing.originalInvoiceId === orderId,
                "subscription-order-mismatch",
            );
        return existing;
    }
    const metadata = subscription.metadata || {};
    const attached = await Membership.find({
        domain: domainId,
        subscriptionId: subscription.id,
        subscriptionMethod: "stripe",
    }).limit(2);
    requireStripeFact(
        attached.length <= 1,
        "subscription-native-owner-mismatch",
    );
    const current = attached[0];
    const nativeOrderId = orderId || metadata.invoiceId;
    const order = nativeOrderId
        ? await Invoice.findOne({
              domain: domainId,
              invoiceId: nativeOrderId,
              paymentProcessor: "stripe",
          })
        : current
          ? await Invoice.findOne({
                domain: domainId,
                membershipId: current.membershipId,
                membershipSessionId: current.sessionId,
                paymentProcessor: "stripe",
            }).sort({ createdAt: 1 })
          : null;
    requireStripeFact(order, "subscription-order-unavailable");
    requireStripeFact(
        !order.paymentMode || order.paymentMode === mode,
        "order-mode-mismatch",
    );
    const membership = await Membership.findOne({
        domain: domainId,
        membershipId: order.membershipId,
        sessionId: order.membershipSessionId,
    });
    requireStripeFact(
        membership,
        "historical-subscription-binding-unavailable",
    );
    requireStripeFact(
        !current ||
            (current.membershipId === membership.membershipId &&
                current.sessionId === membership.sessionId),
        "subscription-native-owner-mismatch",
    );
    requireStripeFact(
        !metadata.membershipId ||
            metadata.membershipId === membership.membershipId,
        "subscription-membership-mismatch",
    );
    requireStripeFact(
        !membership.subscriptionId ||
            membership.subscriptionId === subscription.id,
        "subscription-session-mismatch",
    );
    requireStripeFact(
        current ||
            (metadata.invoiceId === order.invoiceId &&
                metadata.membershipId === membership.membershipId),
        "subscription-correlation-unavailable",
    );
    const plan = await PaymentPlan.findOne({
        domain: domainId,
        planId: membership.paymentPlanId,
        entityId: membership.entityId,
        entityType: membership.entityType,
    });
    requireStripeFact(plan, "subscription-plan-unavailable");
    const customerId = providerId(subscription.customer);
    requireStripeFact(customerId, "subscription-customer-unavailable");
    const children = await Membership.find({
        domain: domainId,
        userId: membership.userId,
        sessionId: membership.sessionId,
        paymentPlanId: membership.paymentPlanId,
        isIncludedInPlan: true,
    })
        .select("membershipId")
        .lean();
    const includedMembershipIds = Array.from(
        new Set<string>([
            ...children.map((child: any) => String(child.membershipId)),
            ...(plan.includedProducts || []).map((courseId: string) =>
                includedMembershipId({
                    domainId,
                    userId: membership.userId,
                    courseId,
                    paymentPlanId: membership.paymentPlanId,
                    sessionId: membership.sessionId,
                }),
            ),
        ]),
    );
    await Binding.init();
    try {
        await Binding.updateOne(
            key,
            {
                $setOnInsert: {
                    ...key,
                    domain: new mongoose.Types.ObjectId(domainId),
                    membershipId: membership.membershipId,
                    membershipSessionId: membership.sessionId,
                    userId: membership.userId,
                    paymentPlanId: membership.paymentPlanId,
                    planType: plan.type,
                    originalInvoiceId: order.invoiceId,
                    customerId,
                    includedMembershipIds,
                    state: {
                        kind: "observed",
                        status: subscription.status,
                        cancelAtPeriodEnd: subscription.cancel_at_period_end,
                    },
                    revision: 0,
                },
            },
            { upsert: true },
        );
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
    }
    const bound = await Binding.findOne(key).lean();
    requireStripeFact(
        bound &&
            bound.membershipSessionId === membership.sessionId &&
            bound.originalInvoiceId === order.invoiceId,
        "subscription-binding-conflict",
    );
    return bound;
}
