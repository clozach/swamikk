import type {
    BillingConsequenceView,
    BillingRefundView,
} from "@/services/member-billing/types";
import { billingCopy as copy } from "./copy";
import { money } from "./format";

export function Consequences({ value }: { value: BillingConsequenceView }) {
    return (
        <section className="space-y-3" aria-label={copy.accessTitle}>
            <h3 className="font-semibold">{copy.accessTitle}</h3>
            <p>{copy.retained}</p>
            <p className="font-medium">{copy.count(value.retainedCount)}</p>
            <p>{copy.archive}</p>
            <p>{copy.drops}</p>
            {value.kind === "partly-unknown" && (
                <p className="rounded-lg border p-3 text-sm">{copy.unknown}</p>
            )}
        </section>
    );
}
export function RefundStatus({ value }: { value: BillingRefundView }) {
    let text: string;
    switch (value.kind) {
        case "not-started":
            text = copy.refundNotStarted;
            break;
        case "processing":
            text = copy.refundProcessing;
            break;
        case "uncertain":
            text = copy.refundUncertain;
            break;
        case "review-required":
            text = copy.refundReview;
            break;
        case "not-required":
            text =
                value.reason === "already-refunded"
                    ? copy.noRefundAlready
                    : copy.noRefundUnpaid;
            break;
        case "refund":
            text =
                value.status === "succeeded"
                    ? copy.refundSucceeded
                    : value.status === "pending"
                      ? copy.refundPending
                      : value.status === "requires_action"
                        ? copy.refundAction
                        : copy.refundFailed;
            break;
    }
    return (
        <div role="status" className="space-y-2">
            <p>{text}</p>
            {value.kind === "refund" && (
                <p className="font-semibold">
                    {money(value.amount, value.currency, true)}
                </p>
            )}
        </div>
    );
}
