import { fromStripeAmount } from "@/payments-new/stripe-currency";

import { billingCopy as copy } from "./copy";

export function money(amount: number, currency: string, minor = false) {
    try {
        if (!Number.isFinite(amount) || amount < 0) throw new Error();
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
            currencyDisplay: "code",
        }).format(minor ? fromStripeAmount(amount, currency) : amount);
    } catch {
        return copy.amountUnavailable;
    }
}
export function date(value: string | null) {
    if (!value || !Number.isFinite(Date.parse(value))) return "—";
    return new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(value));
}
export function statusLabel(value: string) {
    const labels: Record<string, string> = {
        active: "Active",
        expired: "Ended",
        pending: "Pending",
        paid: "Paid",
        failed: "Failed",
        payment_failed: "Payment failed",
        rejected: "Not active",
        paused: "Paused",
    };
    return labels[value] || copy.statusUnavailable;
}
