import type { PaymentPlan } from "@courselit/common-models";
import { getPlanPrice, pricePeriods } from "./get-plan-price";

/** Display policy for prices: explicit currency, readable digits, spaced period. */
export function formatPrice(amount: number, currency = "USD", period = "") {
    const digits = amount.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
    return `${currency.trim().toUpperCase()} ${digits}${period ? ` ${period}` : ""}`;
}

export function formatPlanPrice(
    plan: PaymentPlan | null | undefined,
    currency = "USD",
) {
    const { amount, period } = getPlanPrice(plan);
    return formatPrice(amount, plan?.currencyISOCode || currency, period);
}

/** Keep saved prose using the same policy without changing its amount or wording. */
export function formatPriceText(text: string) {
    return text.replace(
        /\b([A-Z]{3})\s+(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*\/\s*(months?|mos?|years?|yrs?)\b/gi,
        (_, currency: string, amount: string, period: string) =>
            formatPrice(
                Number(amount.replace(/,/g, "")),
                currency,
                period.toLowerCase().startsWith("m")
                    ? pricePeriods.monthly
                    : pricePeriods.yearly,
            ),
    );
}
