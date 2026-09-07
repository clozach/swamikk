import { NextRequest } from "next/server";
import DomainModel, { Domain } from "@models/Domain";
import MembershipModel from "@models/Membership";
import { getPaymentMethod } from "@/payments-new";
import {
    Constants,
    Invoice,
    Membership,
    PaymentPlan,
} from "@courselit/common-models";
import PaymentPlanModel from "@models/PaymentPlan";
import InvoiceModel from "@models/Invoice";
import { error } from "@/services/logger";
import mongoose from "mongoose";
import Payment from "@/payments-new/payment";
import { activateMembership } from "../helpers";
import StripePayment from "@/payments-new/stripe-payment";
import { recordStripeInvoice } from "./stripe-invoice";

export async function POST(req: NextRequest) {
    try {
        // Keep the raw payload around: payment processors sign the exact
        // bytes they send, so signature verification needs it verbatim.
        const rawBody = await req.text();
        const body = JSON.parse(rawBody);
        const domainName = req.headers.get("domain");

        const domain = await getDomain(domainName);
        if (!domain) {
            return Response.json(
                { message: "Domain not found" },
                { status: 404 },
            );
        }

        const paymentMethod = await getPaymentMethod(domain._id.toString());
        if (!paymentMethod) {
            return Response.json({ message: "Payment method not found" });
        }

        if (
            !(await paymentMethod.verify(body, {
                rawBody,
                headers: req.headers,
            }))
        ) {
            return Response.json(
                { message: "Payment not verified" },
                {
                    status:
                        paymentMethod instanceof StripePayment &&
                        !paymentMethod.siteinfo.stripeWebhookSecret
                            ? 503
                            : 400,
                },
            );
        }

        let metadata = paymentMethod.getMetadata(body);
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

        const membership = await getMembership(domain._id, membershipId);
        if (!membership) {
            return Response.json(
                { message: "Membership not found" },
                { status: 404 },
            );
        }
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
                currencyISOCode,
                body,
            );
        }

        const subscriptionId = await handleSubscription(
            paymentPlan,
            paymentMethod,
            body,
            membership,
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

        if (
            paymentPlan?.type === Constants.PaymentPlanType.EMI &&
            subscriptionId
        ) {
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
    } catch (e) {
        error(`Error in payment webhook: ${e.message}`, {
            domain: req.headers.get("domain"),
            stack: e.stack,
        });
        return Response.json({ message: e.message }, { status: 400 });
    }
}

async function getDomain(domainName: string | null) {
    return DomainModel.findOne<Domain>({ name: domainName });
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
) {
    let subscriptionId: string | null = null;
    if (
        paymentPlan?.type === Constants.PaymentPlanType.SUBSCRIPTION ||
        paymentPlan?.type === Constants.PaymentPlanType.EMI
    ) {
        subscriptionId = paymentMethod.getSubscriptionId(body);
        if (!membership.subscriptionId) {
            membership.subscriptionId = subscriptionId;
            membership.subscriptionMethod = paymentMethod.getName();
            await (membership as any).save();
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

export async function GET(req: NextRequest) {
    return Response.json({ message: "success" });
}
