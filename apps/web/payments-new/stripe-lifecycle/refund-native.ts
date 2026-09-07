import BillingCancellation, {
    type InternalBillingCancellation,
} from "@/models/BillingCancellation";
import RefundRequest, {
    type InternalRefundRequest,
} from "@/models/RefundRequest";
import type { InternalStripeChargeRefunds } from "@/models/StripeChargeRefunds";
import type {
    NativeRefundBaseline,
    StripeRefundObservation,
} from "../../../../packages/common-models/src/stripe-refunds";
import { StripeLifecycleError } from "./errors";

export type NativeRefundRecord =
    | InternalBillingCancellation
    | InternalRefundRequest;

export async function readNativeRefunds(domainId: string, userId: string) {
    const scope = { domain: domainId, userId };
    const [cancellations, requests] = await Promise.all([
        BillingCancellation.find(scope).lean(),
        RefundRequest.find(scope).lean(),
    ]);
    return [...cancellations, ...requests];
}

function identity(record: NativeRefundRecord) {
    return "requestId" in record
        ? { kind: "request" as const, id: record.requestId }
        : { kind: "cancellation" as const, id: record.operationId };
}

export function matchesRefundCharge(
    record: NativeRefundRecord,
    ledger: InternalStripeChargeRefunds,
) {
    return (
        String(record.domain) === String(ledger.domain) &&
        record.userId === ledger.userId &&
        record.membershipId === ledger.membershipId &&
        record.membershipSessionId === ledger.membershipSessionId &&
        record.quote?.chargeId === ledger.chargeId &&
        record.quote.mode === ledger.mode
    );
}

export async function captureNativeRefunds(
    ledger: InternalStripeChargeRefunds,
): Promise<NativeRefundBaseline[]> {
    const records = (
        await readNativeRefunds(String(ledger.domain), ledger.userId)
    ).filter((record) => matchesRefundCharge(record, ledger));
    // An expired native claim can still have a live provider request. Its own recovery must settle it first.
    if (records.some((record) => record.claim))
        throw new StripeLifecycleError(
            "refund-native-reconciliation-in-progress",
            true,
        );
    return records
        .map((record) => ({
            ...identity(record),
            revision: record.revision,
            observationId:
                record.refund.kind === "result"
                    ? record.refund.observationId
                    : undefined,
            refund: JSON.stringify(record.refund),
        }))
        .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}

export function nativeRefundOrdering(
    record: NativeRefundRecord,
    ledger: InternalStripeChargeRefunds,
): "same" | "newer" | "unknown" {
    if (
        record.claim ||
        ledger.state.kind !== "observed" ||
        !ledger.state.nativeBaselines ||
        !matchesRefundCharge(record, ledger)
    )
        return "unknown";
    const key = identity(record);
    const baseline = ledger.state.nativeBaselines.find(
        (item) => item.kind === key.kind && item.id === key.id,
    );
    const token =
        record.refund.kind === "result"
            ? record.refund.observationId
            : undefined;
    // Only a token authored when a provider result is saved proves a subsequent money observation.
    if (
        token &&
        token !== baseline?.observationId &&
        (!baseline || record.revision > baseline.revision)
    )
        return "newer";
    if (baseline && baseline.refund === JSON.stringify(record.refund))
        return "same";
    return "unknown";
}

export function exactNativeRefund(
    record: NativeRefundRecord,
    refund: StripeRefundObservation,
) {
    return record.refund.kind === "result" &&
        record.refund.result.kind === "refund" &&
        record.refund.result.refundId === refund.refundId &&
        record.refund.result.amount === refund.amount &&
        record.refund.result.currency === refund.currency
        ? record.refund.result
        : null;
}

/** Read projection only; a newer exact native observation can supersede an older webhook snapshot. */
export function withNativeRefundEvidence(
    ledger: InternalStripeChargeRefunds,
    records: NativeRefundRecord[],
): InternalStripeChargeRefunds {
    if (ledger.state.kind !== "observed") return ledger;
    const state = ledger.state;
    let observedAt = new Date(state.observedAt);
    const refunds = state.refunds.map((refund) => {
        const newerRecords = records.filter(
            (record) =>
                nativeRefundOrdering(record, ledger) === "newer" &&
                exactNativeRefund(record, refund),
        );
        const newer = newerRecords.map((record) =>
            exactNativeRefund(record, refund),
        );
        if (
            newer.length &&
            newer.every((item) => item!.status === newer[0]!.status)
        ) {
            for (const record of newerRecords) {
                if (
                    record.refund.kind === "result" &&
                    record.refund.observedAt &&
                    new Date(record.refund.observedAt) > observedAt
                )
                    observedAt = new Date(record.refund.observedAt);
            }
        }
        return newer.length &&
            newer.every((item) => item!.status === newer[0]!.status)
            ? { ...refund, status: newer[0]!.status }
            : refund;
    });
    return {
        ...ledger,
        state: {
            ...state,
            refunds,
            observedAt,
            refundedAmount: refunds
                .filter((item) => item.status === "succeeded")
                .reduce((sum, item) => sum + item.amount, 0),
        },
    };
}
