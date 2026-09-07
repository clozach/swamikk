import { NextRequest } from "next/server";
import DomainModel, { Domain } from "@models/Domain";
import { getPaymentMethod } from "@/payments-new";
import { error } from "@/services/logger";
import StripePayment from "@/payments-new/stripe-payment";
import { handleStripeEvent } from "@/payments-new/stripe-lifecycle/webhook";
import { readWebhookBody } from "@/payments-new/stripe-lifecycle/body";
import { StripeLifecycleError } from "@/payments-new/stripe-lifecycle/errors";
import { handlePayment } from "./processing";

export async function POST(req: NextRequest) {
    try {
        // Keep the raw payload around: payment processors sign the exact
        // bytes they send, so signature verification needs it verbatim.
        const rawBody = await readWebhookBody(req);
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

        if (paymentMethod instanceof StripePayment) {
            const verified = await paymentMethod.authenticate({
                rawBody,
                headers: req.headers,
            });
            if (!verified)
                return Response.json(
                    { message: "Payment not verified" },
                    {
                        status: paymentMethod.siteinfo.stripeWebhookSecret
                            ? 400
                            : 503,
                    },
                );
            return await handleStripeEvent(
                String(domain._id),
                verified,
                paymentMethod,
                (binding, active) =>
                    handlePayment(
                        domain,
                        paymentMethod,
                        verified,
                        binding,
                        active,
                    ),
            );
        }

        if (!(await paymentMethod.verify(body))) {
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

        return await handlePayment(domain, paymentMethod, body);
    } catch (e) {
        error(`Error in payment webhook: ${e.message}`, {
            domain: req.headers.get("domain"),
            stack: e.stack,
        });
        const known = e instanceof StripeLifecycleError;
        return Response.json(
            {
                message: known
                    ? e.reason
                    : e instanceof SyntaxError
                      ? "Invalid webhook"
                      : "Webhook processing unavailable",
            },
            {
                status: known
                    ? e.retryable
                        ? 503
                        : 400
                    : e instanceof SyntaxError
                      ? 400
                      : 503,
            },
        );
    }
}

async function getDomain(domainName: string | null) {
    return DomainModel.findOne<Domain>({ name: domainName });
}

export async function GET(req: NextRequest) {
    return Response.json({ message: "success" });
}
