import { createHash } from "crypto";
import type Stripe from "stripe";
import type {
    StripeCancellationReviewReason,
    StripeMonthlyCancellationQuote,
    ExistingStripeRefund,
    RefundStatus,
    StripeCancellationClient,
} from "./types";

export class CancellationReview extends Error {
    constructor(public reason: StripeCancellationReviewReason) {
        super(reason);
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = "CancellationReview";
    }
}
export function requireProvider(
    condition: unknown,
    reason: StripeCancellationReviewReason,
): asserts condition {
    if (!condition) throw new CancellationReview(reason);
}
export const providerId = (
    value: string | { id: string } | null | undefined,
): string | null => (typeof value === "string" ? value : value?.id || null);
export const minorAmount = (value: number) =>
    Number.isSafeInteger(value) && value >= 0;
const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
        return Object.fromEntries(
            Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, child]) => [key, canonical(child)]),
        );
    return value;
};
export const stableJson = (value: unknown) => JSON.stringify(canonical(value));
export function quoteHash(
    quote:
        | Omit<StripeMonthlyCancellationQuote, "quoteHash">
        | StripeMonthlyCancellationQuote,
) {
    const { quoteHash: _ignored, ...rest } =
        quote as StripeMonthlyCancellationQuote;
    return createHash("sha256").update(stableJson(rest)).digest("hex");
}
export function validateQuote(quote: StripeMonthlyCancellationQuote) {
    requireProvider(
        quote.kind === "stripe-monthly-cancellation" &&
            quote.version === 1 &&
            quoteHash(quote) === quote.quoteHash &&
            [
                quote.paidAmount,
                quote.refundedAmount,
                quote.refundableAmount,
            ].every(minorAmount) &&
            quote.refundedAmount + quote.refundableAmount === quote.paidAmount,
        "invalid-quote",
    );
}
export function refundStatus(status: string | null): RefundStatus {
    requireProvider(
        [
            "pending",
            "succeeded",
            "failed",
            "canceled",
            "requires_action",
        ].includes(status || ""),
        "refund-history-incomplete",
    );
    return status as RefundStatus;
}
export async function allChargeRefunds(
    stripe: Pick<StripeCancellationClient, "refunds">,
    chargeId: string,
) {
    const refunds: Stripe.Refund[] = [];
    let starting_after: string | undefined;
    for (let page = 0; page < 20; page++) {
        const list = await stripe.refunds.list({
            charge: chargeId,
            limit: 100,
            ...(starting_after ? { starting_after } : {}),
        });
        requireProvider(
            list.data.every(
                (r) =>
                    providerId(r.charge) === chargeId && minorAmount(r.amount),
            ),
            "charge-mismatch",
        );
        refunds.push(...list.data);
        if (!list.has_more) return refunds;
        const next = list.data.at(-1)?.id;
        requireProvider(
            next && next !== starting_after,
            "refund-history-incomplete",
        );
        starting_after = next;
    }
    throw new CancellationReview("refund-history-incomplete");
}
export function refundSnapshot(
    refunds: Stripe.Refund[],
    currency: string,
): ExistingStripeRefund[] {
    return refunds
        .map((refund) => {
            requireProvider(refund.currency === currency, "charge-mismatch");
            return {
                id: refund.id,
                amount: refund.amount,
                status: refundStatus(refund.status),
            };
        })
        .sort((a, b) => a.id.localeCompare(b.id));
}
