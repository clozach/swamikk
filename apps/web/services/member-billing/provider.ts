import Stripe from "stripe";
import type GQLContext from "@/models/GQLContext";
import type { Membership } from "@courselit/common-models";
import type { StripeCancellationClient } from "@/payments-new/cancellation";
import { requireCondition } from "@/services/content-changes/errors";

export interface BillingProvider {
    client: StripeCancellationClient;
    livemode: boolean;
}
export interface BillingDependencies {
    provider(ctx: GQLContext, membership: Membership): Promise<BillingProvider>;
    now(): Date;
}
export async function resolveBillingProvider(
    ctx: GQLContext,
    membership: Membership,
): Promise<BillingProvider> {
    requireCondition(
        membership.subscriptionMethod === "stripe" && membership.subscriptionId,
        "needs_review",
        "This membership needs help with cancellation.",
        409,
    );
    const secret = ctx.subdomain.settings?.stripeSecret;
    requireCondition(
        secret && /^(sk|rk)_(test|live)_/.test(secret),
        "needs_review",
        "The payment connection needs review.",
        409,
    );
    return {
        client: new Stripe(secret, {
            typescript: true,
            timeout: 20_000,
            maxNetworkRetries: 0,
        }),
        livemode: /^(sk|rk)_live_/.test(secret),
    };
}
export const billingDependencies: BillingDependencies = {
    provider: resolveBillingProvider,
    now: () => new Date(),
};
