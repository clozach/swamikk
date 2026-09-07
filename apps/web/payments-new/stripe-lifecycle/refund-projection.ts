import Ledger, {
    type InternalStripeChargeRefunds,
} from "@/models/StripeChargeRefunds";
import type { MemberRefundSummary } from "../../../../packages/common-models/src/stripe-refunds";
import BillingCancellation, {
    type InternalBillingCancellation,
} from "@/models/BillingCancellation";
import RefundRequest, {
    type InternalRefundRequest,
} from "@/models/RefundRequest";
import { fromStripeAmount } from "../stripe-currency";
import { PurchaseAccessModel } from "../../../../packages/common-logic/src/purchase-access/model";
import {
    withNativeRefundEvidence,
    nativeRefundOrdering,
} from "./refund-native";

export async function readRefundProjection(
    domainId: string,
    userIds: string[],
) {
    const scope = {
        domain: domainId,
        userId: { $in: Array.from(new Set(userIds)) },
    };
    const [ledgers, cancellations, requests, access] = await Promise.all([
        Ledger.find(scope).lean(),
        BillingCancellation.find(scope).lean(),
        RefundRequest.find(scope).lean(),
        PurchaseAccessModel.find({ ...scope, state: { $ne: "open" } }).lean(),
    ]);
    const native = [...cancellations, ...requests];
    return {
        evidence: ledgers.map((record) =>
            withNativeRefundEvidence(record, native),
        ),
        access,
    };
}
export async function readUserRefundEvidence(domainId: string, userId: string) {
    return (await readRefundProjection(domainId, [userId])).evidence;
}
export function refundSummaryFor(
    projection: Awaited<ReturnType<typeof readRefundProjection>>,
    key: {
        userId: string;
        invoiceId: string;
        membershipId: string;
        membershipSessionId: string;
    },
): MemberRefundSummary {
    const record = projection.evidence.find(
        (item) =>
            item.invoiceId === key.invoiceId &&
            item.userId === key.userId &&
            item.membershipId === key.membershipId &&
            item.membershipSessionId === key.membershipSessionId,
    );
    const consequence = projection.access.find(
        (item) =>
            item.userId === key.userId &&
            item.membershipId === key.membershipId &&
            item.membershipSessionId === key.membershipSessionId &&
            item.proof?.invoiceId === key.invoiceId &&
            (!record ||
                (item.proof.chargeId === record.chargeId &&
                    item.proof.mode === record.mode)),
    );
    const summary = memberRefundSummary(record);
    return consequence
        ? {
              ...summary,
              purchaseAccess: consequence.financialReviewRequired
                  ? "recovery-required"
                  : consequence.state === "ending"
                    ? "pending"
                    : consequence.bookingReviewRequired
                      ? "ended-booking-review"
                      : "ended",
          }
        : summary;
}

export function memberRefundSummary(
    record?:
        | (InternalStripeChargeRefunds & {
              purchaseAccess?:
                  | "pending"
                  | "ended"
                  | "ended-booking-review"
                  | "recovery-required";
          })
        | null,
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
        ...(record.purchaseAccess
            ? { purchaseAccess: record.purchaseAccess }
            : {}),
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
