import Payment, { InitiateProps, WebhookContext } from "./payment";
import { responses } from "../config/strings";
import { error, warn } from "../services/logger";
import Stripe from "stripe";
import {
    Constants,
    PaymentPlan,
    SiteInfo,
    UIConstants,
} from "@courselit/common-models";
import { getUnitAmount } from "./helpers";
import { toStripeAmount } from "./stripe-currency";

const {
    payment_invalid_settings: paymentInvalidSettings,
    currency_iso_not_set: currencyISONotSet,
} = responses;

export default class StripePayment implements Payment {
    public siteinfo: SiteInfo;
    public name: string;
    public stripe: any;

    constructor(siteinfo: SiteInfo) {
        this.siteinfo = siteinfo;
        this.name = UIConstants.PAYMENT_METHOD_STRIPE;
    }

    async setup() {
        if (!this.siteinfo.currencyISOCode) {
            throw new Error(currencyISONotSet);
        }

        if (!this.siteinfo.stripeKey || !this.siteinfo.stripeSecret) {
            throw new Error(`${this.name} ${paymentInvalidSettings}`);
        }

        this.stripe = new Stripe(this.siteinfo.stripeSecret, {
            typescript: true,
        });

        return this;
    }

    async initiate({ metadata, paymentPlan, product, origin }: InitiateProps) {
        const unit_amount = toStripeAmount(
            getUnitAmount(paymentPlan),
            this.siteinfo.currencyISOCode!,
        );
        const sessionPayload: any = {
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: this.siteinfo.currencyISOCode,
                        product_data: {
                            name: product.title,
                        },
                        unit_amount,
                        recurring: this.getRecurring(paymentPlan),
                    },
                    quantity: 1,
                },
            ],
            mode:
                paymentPlan.type === Constants.PaymentPlanType.SUBSCRIPTION ||
                paymentPlan.type === Constants.PaymentPlanType.EMI
                    ? "subscription"
                    : "payment",
            success_url: `${origin}/checkout/verify?id=${metadata.invoiceId}`,
            cancel_url: `${origin}/checkout?type=${product.type}&id=${product.id}`,
            metadata,
            allow_promotion_codes: true,
        };
        if (sessionPayload.mode === "subscription") {
            // Checkout metadata stays on the session unless explicitly copied
            // to the subscription. Renewal invoices need this correlation.
            sessionPayload.subscription_data = { metadata };
        }
        const session =
            await this.stripe.checkout.sessions.create(sessionPayload);

        // Return the hosted Checkout URL so the browser can redirect with a
        // plain top-level navigation. This keeps Stripe.js out of our checkout
        // page entirely — no client SDK, no m-outer/inner.html metrics iframe
        // (which Safari was downloading), and no deprecated redirectToCheckout.
        // The webhook correlates via metadata.invoiceId, not this value, so
        // returning the URL instead of session.id is functionally safe.
        if (!session.url) {
            throw new Error(
                "Stripe Checkout session did not include a redirect URL",
            );
        }
        return session.url;
    }

    async getCurrencyISOCode() {
        return this.siteinfo.currencyISOCode!;
    }

    async verify(event: Stripe.Event, context?: WebhookContext) {
        const verified = await this.authenticate(context);
        return !!verified && this.isPaymentEvent(verified);
    }

    async authenticate(context?: WebhookContext): Promise<Stripe.Event | null> {
        if (this.siteinfo.stripeWebhookSecret) {
            const signature = context?.headers.get("stripe-signature");
            if (!context || !signature) {
                return null;
            }
            try {
                return this.stripe.webhooks.constructEvent(
                    context.rawBody,
                    signature,
                    this.siteinfo.stripeWebhookSecret,
                );
            } catch (err: any) {
                await error(
                    `Stripe webhook signature verification failed: ${err.message}`,
                );
                return null;
            }
        } else {
            await warn(
                "Stripe webhook secret is not configured; rejecting the webhook without changing payment or membership data.",
            );
            return null;
        }
    }

    isPaymentEvent(event: Stripe.Event) {
        if (
            event.type === "checkout.session.completed" &&
            (event.data.object as any).payment_status === "paid"
        ) {
            return true;
        }
        if (
            event.type === "invoice.paid" &&
            (event.data.object as any).billing_reason === "subscription_cycle"
        ) {
            return true;
        }
        return false;
    }

    getPaymentIdentifier(event: Stripe.Event) {
        return (event.data.object as any).id;
    }

    getMetadata(event: Stripe.Event) {
        let metadata;
        if (event.type === "checkout.session.completed") {
            metadata = (event.data.object as any).metadata;
        } else {
            const invoice = event.data.object as any;
            metadata =
                invoice.parent?.subscription_details?.metadata ??
                invoice.subscription_details?.metadata;
        }
        return metadata || {};
    }

    getName() {
        return this.name;
    }

    async cancel(subscriptionId: string) {
        try {
            let subscription =
                await this.stripe.subscriptions.retrieve(subscriptionId);
            if (subscription && subscription.status !== "canceled") {
                subscription =
                    await this.stripe.subscriptions.cancel(subscriptionId);
            }
            return subscription;
        } catch (error) {
            throw new Error(`Failed to cancel subscription: ${error.message}`);
        }
    }

    getSubscriptionId(event: Stripe.Event): string {
        const object = event.data.object as any;
        const subscription =
            object.subscription ??
            object.parent?.subscription_details?.subscription;
        return typeof subscription === "string"
            ? subscription
            : subscription?.id;
    }

    async validateSubscription(subscriptionId: string) {
        const subscription =
            await this.stripe.subscriptions.retrieve(subscriptionId);

        if (subscription.status === "active") {
            return true;
        } else {
            return false;
        }
    }

    private getRecurring(paymentPlan: PaymentPlan) {
        let recurring: any = undefined;

        switch (paymentPlan.type) {
            case Constants.PaymentPlanType.SUBSCRIPTION:
                recurring = {
                    interval: paymentPlan.subscriptionYearlyAmount
                        ? "year"
                        : "month",
                };
                break;
            case Constants.PaymentPlanType.EMI:
                recurring = {
                    interval: "month",
                };
                break;
        }

        return recurring;
    }
}
