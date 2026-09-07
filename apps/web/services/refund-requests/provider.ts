import Stripe from "stripe";
import type GQLContext from "@/models/GQLContext";
import { toStripeAmount } from "@/payments-new/stripe-currency";
import { requireCondition } from "@/services/content-changes/errors";
import type { refundReceipt } from "./receipts";
import type {
    PurchaseRefundClient,
    PurchaseRefundInput,
} from "./provider-types";

export interface RefundRequestDependencies {
    client(
        ctx: GQLContext,
        mode: "test" | "live",
    ): Promise<PurchaseRefundClient>;
    now(): Date;
}
export const refundRequestDependencies: RefundRequestDependencies = {
    now: () => new Date(),
    async client(ctx, mode) {
        const secret = ctx.subdomain.settings?.stripeSecret;
        requireCondition(
            secret &&
                /^(sk|rk)_(test|live)_/.test(secret) &&
                (/^(sk|rk)_live_/.test(secret) ? "live" : "test") === mode,
            "needs_review",
            "The payment connection or mode needs review.",
            409,
        );
        return new Stripe(secret, {
            typescript: true,
            timeout: 20_000,
            maxNetworkRetries: 0,
        });
    },
};
export function purchaseInput(
    receipt: Awaited<ReturnType<typeof refundReceipt>>,
): PurchaseRefundInput | null {
    const { invoice } = receipt;
    if (
        invoice.paymentProcessor !== "stripe" ||
        !invoice.paymentMode ||
        !invoice.paymentProcessorTransactionId?.startsWith("cs_")
    )
        return null;
    return {
        invoiceId: invoice.invoiceId,
        membershipId: invoice.membershipId,
        membershipSessionId: invoice.membershipSessionId,
        checkoutSessionId: invoice.paymentProcessorTransactionId,
        paidAmount: toStripeAmount(invoice.amount, invoice.currencyISOCode),
        currency: invoice.currencyISOCode.toLowerCase(),
        mode: invoice.paymentMode,
    };
}
