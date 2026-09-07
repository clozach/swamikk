import type { MemberRefundSummary } from "@courselit/common-models";
import { money } from "@/components/member-billing/format";
import { refundSummaryCopy as copy } from "./copy";

function checkedTime(value: string) {
    if (!Number.isFinite(Date.parse(value))) return null;
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
    }).format(new Date(value));
}

/** The server supplies currency major units and current known money evidence, independent of access. */
export default function RefundSummary({
    summary,
}: {
    summary?: MemberRefundSummary;
}) {
    if (!summary || summary.kind === "unrecorded")
        return (
            <section
                aria-label={copy.title}
                className="text-sm text-muted-foreground"
            >
                <p>{copy.unrecorded}</p>
                {summary?.purchaseAccess && (
                    <p role="status">{copy.access[summary.purchaseAccess]}</p>
                )}
            </section>
        );
    const checked = checkedTime(summary.observedAt);
    return (
        <section
            aria-label={copy.title}
            className="space-y-3 rounded-xl border p-4 text-sm"
        >
            <p className="font-semibold">{copy.title}</p>
            <dl className="space-y-2">
                <div className="flex flex-wrap justify-between gap-x-5 gap-y-1">
                    <dt>{copy.total}</dt>
                    <dd className="font-semibold tabular-nums">
                        {money(summary.refundedAmount, summary.currency)}
                    </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <dt>{copy.checked}</dt>
                    <dd>
                        {checked ? (
                            <time dateTime={summary.observedAt}>{checked}</time>
                        ) : (
                            copy.unknownTime
                        )}
                    </dd>
                </div>
            </dl>
            {summary.refunds.length ? (
                <ul className="divide-y">
                    {summary.refunds.map((refund, index) => (
                        <li
                            key={`${index}:${refund.status}:${refund.amount}`}
                            className="space-y-1 py-2 first:pt-0 last:pb-0"
                        >
                            <p className="flex flex-wrap justify-between gap-x-5 gap-y-1">
                                <span className="font-medium">
                                    {copy.states[refund.status]}
                                </span>
                                <span className="tabular-nums">
                                    {money(refund.amount, summary.currency)}
                                </span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {copy.details[refund.status]}
                            </p>
                        </li>
                    ))}
                </ul>
            ) : (
                <p>{copy.empty}</p>
            )}
            <p className="text-xs text-muted-foreground">{copy.separate}</p>
            {summary.purchaseAccess && (
                <p role="status">{copy.access[summary.purchaseAccess]}</p>
            )}
        </section>
    );
}
