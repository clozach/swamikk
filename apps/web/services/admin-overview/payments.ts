import { memberRefundSummary } from "@/payments-new/stripe-lifecycle/refund-projection";
import { withNativeRefundEvidence } from "@/payments-new/stripe-lifecycle/refund-native";
import type { OverviewRecords } from "./load";
import type { PaymentOverview } from "./types";
import { date } from "./records";

export function effectiveRefunds(records: OverviewRecords) {
    return records.refunds.rows.map((ledger) =>
        withNativeRefundEvidence(ledger, [
            ...records.cancellations.rows,
            ...records.requests.rows,
        ]),
    );
}

export function paymentOverview(
    records: OverviewRecords,
    from: Date,
    now: Date,
) {
    const groups = new Map<string, PaymentOverview>();
    const refunds = effectiveRefunds(records);
    let undatedPaidReceipts = 0;
    for (const invoice of records.payments.rows) {
        const at = date(invoice.settlement?.at);
        if (!at) {
            undatedPaidReceipts++;
            continue;
        }
        if (at < from || at > now) continue;
        const mode = invoice.paymentMode || "unknown";
        const currency = /^[a-z]{3}$/i.test(invoice.currencyISOCode)
            ? invoice.currencyISOCode.toUpperCase()
            : "UNKNOWN";
        const key = `${mode}:${currency}`;
        const group = groups.get(key) || {
            mode,
            currency,
            receipts: 0,
            paid: 0,
            observedRefunds: 0,
            refundEvidenceCount: 0,
            refundsCheckedAt: null,
        };
        group.receipts++;
        group.paid += invoice.amount;
        const refund = memberRefundSummary(
            refunds.find((item) => item.invoiceId === invoice.invoiceId),
        );
        if (
            refund.kind === "observed" &&
            refund.currency.toUpperCase() === currency
        ) {
            group.refundEvidenceCount++;
            group.observedRefunds += refund.refundedAmount;
            // The oldest observation is the conservative freshness bound for a total.
            if (
                !group.refundsCheckedAt ||
                refund.observedAt < group.refundsCheckedAt
            )
                group.refundsCheckedAt = refund.observedAt;
        }
        groups.set(key, group);
    }
    return {
        payments: Array.from(groups.values()).sort((a, b) =>
            `${a.mode}:${a.currency}`.localeCompare(`${b.mode}:${b.currency}`),
        ),
        undatedPaidReceipts,
    };
}
