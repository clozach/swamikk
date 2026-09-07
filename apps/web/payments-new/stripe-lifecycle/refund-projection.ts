import Ledger, {
    type InternalStripeChargeRefunds,
} from "@/models/StripeChargeRefunds";
import type { MemberRefundSummary } from "../../../../packages/common-models/src/stripe-refunds";
import type { InternalBillingCancellation } from "@/models/BillingCancellation";
import type { InternalRefundRequest } from "@/models/RefundRequest";
import { fromStripeAmount } from "../stripe-currency";
import {
    readNativeRefunds,
    withNativeRefundEvidence,
    nativeRefundOrdering,
} from "./refund-native";

export async function readUserRefundEvidence(domainId: string, userId: string) {
    const ledgers = await Ledger.find({ domain: domainId, userId }).lean();
    const native = await readNativeRefunds(domainId, userId);
    return ledgers.map((record) => withNativeRefundEvidence(record, native));
}

export function memberRefundSummary(
    record?: InternalStripeChargeRefunds | null,
): MemberRefundSummary {
    if (!record || record.state.kind !== "observed")
        return { kind: "unrecorded" };
    return {
        kind: "observed",
        currency: record.currency,
        refundedAmount: fromStripeAmount(
            record.state.refundedAmount,
            record.currency,
        ),
        refunds: record.state.refunds.map((refund) => ({
            status: refund.status,
            amount: fromStripeAmount(refund.amount, record.currency),
        })),
        observedAt: new Date(record.state.observedAt).toISOString(),
    };
}

/** A known native refund ID may show fresh money status. Approval, claims and access remain untouched. */
export function withObservedRefund<
    T extends InternalBillingCancellation | InternalRefundRequest,
>(record: T, evidence: InternalStripeChargeRefunds[]): T {
    if (
        record.refund.kind !== "result" ||
        record.refund.result.kind !== "refund" ||
        !record.quote
    )
        return record;
    const result = record.refund.result;
    const ledger = evidence.find(
        (item) =>
            String(item.domain) === String(record.domain) &&
            item.userId === record.userId &&
            item.membershipId === record.membershipId &&
            item.membershipSessionId === record.membershipSessionId &&
            item.chargeId === record.quote?.chargeId &&
            item.mode === record.quote.mode,
    );
    if (
        !ledger ||
        ledger.state.kind !== "observed" ||
        nativeRefundOrdering(record, ledger) !== "same"
    )
        return record;
    const observed = ledger.state.refunds.find(
        (item) =>
            item.refundId === result.refundId &&
            item.amount === result.amount &&
            item.currency === result.currency,
    );
    return observed
        ? {
              ...record,
              refund: {
                  ...record.refund,
                  result: { ...result, status: observed.status },
              },
          }
        : record;
}

export function refundEvidenceNeedsAttention(
    record: InternalStripeChargeRefunds,
) {
    return (
        !!record.claim ||
        record.state.kind === "bound" ||
        record.state.refunds.some((item) =>
            ["pending", "requires_action"].includes(item.status),
        )
    );
}
