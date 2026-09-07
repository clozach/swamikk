import type { Domain } from "@models/Domain";
import MembershipModel from "@models/Membership";
import UserModel from "@models/User";
import PaymentPlanModel from "@models/PaymentPlan";
import InvoiceModel from "@models/Invoice";
import {
    Constants,
    Invoice,
    Membership,
    PaymentPlan,
} from "@courselit/common-models";
import mongoose from "mongoose";
import type Payment from "@/payments-new/payment";
import StripePayment from "@/payments-new/stripe-payment";
import type { InternalStripeSubscriptionBinding } from "@/models/StripeSubscriptionBinding";
import {
    AccountLifecycleError,
    withAccountWrite,
} from "../../../../../../packages/common-logic/src/account-lifecycle/gate";
import { StripeLifecycleError } from "@/payments-new/stripe-lifecycle/errors";
import { recordStripeInvoice } from "./stripe-invoice";
import { activateMembership } from "../helpers";

export async function handlePayment(
    domain: Domain & { _id: mongoose.Types.ObjectId },
    paymentMethod: Payment,
    body: any,
    binding?: InternalStripeSubscriptionBinding,
    active?: boolean,
) {
    const metadata = binding || paymentMethod.getMetadata(body);
    const membership =
        typeof metadata.membershipId === "string"
            ? await getMembership(domain._id, metadata.membershipId)
            : null;
    if (!membership)
        return Response.json(
            { message: "Membership not found" },
            { status: 404 },
        );
    try {
        return await withAccountWrite(
            {
                domainId: String(domain._id),
                userId: membership.userId,
                purpose: "payment-webhook",
            },
            () => applyPayment(domain, paymentMethod, body, binding, active),
        );
    } catch (error) {
        if (!(error instanceof AccountLifecycleError)) throw error;
        const present = await UserModel.exists({
            domain: domain._id,
            userId: membership.userId,
            active: true,
        });
        if (present)
            return Response.json(
                {
                    message:
                        "Account closure is in progress; payment reconciliation will retry",
                },
                { status: 503 },
            );
        const response = await applyPayment(
            domain,
            paymentMethod,
            body,
            binding,
            false,
        );
        if (paymentMethod instanceof StripePayment)
            throw new StripeLifecycleError("paid-account-unavailable");
        return response;
    }
}

async function applyPayment(
    domain: Domain & { _id: mongoose.Types.ObjectId },
    paymentMethod: Payment,
    body: any,
    binding?: InternalStripeSubscriptionBinding,
    active?: boolean,
) {
    let metadata = binding
        ? {
              membershipId: binding.membershipId,
              invoiceId: binding.originalInvoiceId,
          }
        : paymentMethod.getMetadata(body);
    if (
        paymentMethod instanceof StripePayment &&
        body.type === "invoice.paid" &&
        (!metadata.membershipId || !metadata.invoiceId)
    ) {
        const subscriptionId = paymentMethod.getSubscriptionId(body);
        // Subscriptions created before subscription_data.metadata was added
        // can still renew. Correlate only through a tenant-owned subscription
        // and its current checkout session, never a supplied user ID.
        const existing = subscriptionId
            ? await MembershipModel.findOne({
                  domain: domain._id,
                  subscriptionId,
                  subscriptionMethod: "stripe",
              })
            : null;
        const order = existing
            ? await InvoiceModel.findOne({
                  domain: domain._id,
                  membershipId: existing.membershipId,
                  membershipSessionId: existing.sessionId,
                  paymentProcessor: "stripe",
              }).sort({ createdAt: 1 })
            : null;
        if (order)
            metadata = {
                membershipId: existing.membershipId,
                invoiceId: order.invoiceId,
                currencyISOCode: order.currencyISOCode,
            };
    }
    const { membershipId, invoiceId, currencyISOCode } = metadata;
    if (typeof membershipId !== "string" || typeof invoiceId !== "string")
        throw new Error("Payment correlation is unavailable.");

    const loadedMembership = await getMembership(domain._id, membershipId);
    if (!loadedMembership) {
        return Response.json(
            { message: "Membership not found" },
            { status: 404 },
        );
    }
    let membership: Membership = loadedMembership;
    const historical =
        !!binding && membership.sessionId !== binding.membershipSessionId;
    if (historical)
        membership = {
            ...(loadedMembership as any).toObject(),
            sessionId: binding.membershipSessionId,
            paymentPlanId: binding.paymentPlanId,
            subscriptionId: binding.subscriptionId,
        };
    if (
        paymentMethod instanceof StripePayment &&
        body.type === "invoice.paid" &&
        membership.subscriptionId &&
        membership.subscriptionId !== paymentMethod.getSubscriptionId(body)
    ) {
        return Response.json(
            { message: "Payment belongs to a different subscription" },
            { status: 409 },
        );
    }

    const paymentPlan = await getPaymentPlan(
        domain._id,
        membership.paymentPlanId!,
    );
    if (paymentMethod instanceof StripePayment) {
        await recordStripeInvoice(
            body,
            domain._id,
            invoiceId as string,
            membership,
        );
    } else {
        await handleInvoice(
            domain,
            invoiceId,
            membership,
            paymentPlan,
            paymentMethod,
            currencyISOCode as string,
            body,
        );
    }

    if (historical || active === false)
        return Response.json({
            message: "Payment recorded without activating access",
        });

    const subscriptionId = await handleSubscription(
        paymentPlan,
        paymentMethod,
        body,
        membership,
        domain._id,
    );

    if (
        paymentMethod instanceof StripePayment &&
        paymentPlan?.type === Constants.PaymentPlanType.SUBSCRIPTION &&
        subscriptionId &&
        !(await paymentMethod.validateSubscription(subscriptionId))
    ) {
        return Response.json({
            message: "Payment recorded; subscription is no longer active",
        });
    }

    if (paymentPlan?.type === Constants.PaymentPlanType.EMI && subscriptionId) {
        await handleEMICancellation(
            domain._id,
            membership,
            paymentPlan,
            subscriptionId,
            paymentMethod,
        );
    }

    await activateMembership(domain, membership, paymentPlan);

    return Response.json({ message: "success" });
}

async function getMembership(
    domainId: mongoose.Types.ObjectId,
    membershipId: string,
) {
    return MembershipModel.findOne<Membership>({
        domain: domainId,
        membershipId,
    });
}

async function getPaymentPlan(
    domainId: mongoose.Types.ObjectId,
    paymentPlanId: string,
) {
    return PaymentPlanModel.findOne<PaymentPlan>({
        domain: domainId,
        planId: paymentPlanId,
        internal: false,
    });
}

async function handleSubscription(
    paymentPlan: PaymentPlan | null,
    paymentMethod: Payment,
    body: any,
    membership: Membership,
    domainId: mongoose.Types.ObjectId,
) {
    let subscriptionId: string | null = null;
    if (
        paymentPlan?.type === Constants.PaymentPlanType.SUBSCRIPTION ||
        paymentPlan?.type === Constants.PaymentPlanType.EMI
    ) {
        subscriptionId = paymentMethod.getSubscriptionId(body);
        if (!membership.subscriptionId) {
            const attached = await MembershipModel.updateOne(
                {
                    domain: domainId,
                    membershipId: membership.membershipId,
                    sessionId: membership.sessionId,
                    $or: [
                        { subscriptionId: { $exists: false } },
                        { subscriptionId: null },
                        { subscriptionId: "" },
                    ],
                },
                {
                    $set: {
                        subscriptionId,
                        subscriptionMethod: paymentMethod.getName(),
                    },
                },
            );
            if (!attached.matchedCount)
                throw new Error(
                    "The membership changed while attaching its subscription.",
                );
            membership.subscriptionId = subscriptionId;
            membership.subscriptionMethod = paymentMethod.getName();
        }
    }
    return subscriptionId;
}

async function handleInvoice(
    domain: Domain,
    invoiceId: string,
    membership: Membership,
    paymentPlan: PaymentPlan | null,
    paymentMethod: any,
    currencyISOCode: string,
    body: any,
) {
    const invoice = await InvoiceModel.findOne<Invoice>({
        domain: domain._id,
        invoiceId,
        status: Constants.InvoiceStatus.PENDING,
    });
    if (invoice) {
        invoice.paymentProcessorTransactionId =
            paymentMethod.getPaymentIdentifier(body);
        invoice.status = Constants.InvoiceStatus.PAID;
        await (invoice as any).save();
    } else {
        await InvoiceModel.create({
            domain: domain._id,
            membershipId: membership.membershipId,
            membershipSessionId: membership.sessionId,
            amount:
                paymentPlan?.oneTimeAmount ||
                paymentPlan?.subscriptionYearlyAmount ||
                paymentPlan?.subscriptionMonthlyAmount ||
                paymentPlan?.emiAmount ||
                0,
            status: Constants.InvoiceStatus.PAID,
            paymentProcessor: paymentMethod.name,
            paymentProcessorTransactionId:
                paymentMethod.getPaymentIdentifier(body),
            currencyISOCode,
        });
    }
}

async function handleEMICancellation(
    domainId: mongoose.Types.ObjectId,
    membership: Membership,
    paymentPlan: PaymentPlan,
    subscriptionId: string,
    paymentMethod: any,
) {
    const paidInvoicesCount = await InvoiceModel.countDocuments({
        domain: domainId,
        membershipId: membership.membershipId,
        status: Constants.InvoiceStatus.PAID,
        membershipSessionId: membership.sessionId,
    });
    if (paidInvoicesCount >= paymentPlan.emiTotalInstallments!) {
        await paymentMethod.cancel(subscriptionId);
    }
}
