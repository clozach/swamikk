import type { ReactNode } from "react";
import type { MemberRefundSummary } from "@courselit/common-models";
import RefundSummary from "@/components/refund-summary";
import { refundSummaryCopy } from "@/components/refund-summary/copy";
import Link from "next/link";
import type { RefundRequestView } from "@/services/refund-requests/types";
import { money } from "@/components/member-billing/format";
import {
    classTime,
    refundCopy as copy,
    requestStatus,
    refundStatus,
} from "./copy";

export function RequestCard({
    request,
    children,
    showReceipt = true,
    refundSummary = request.refundSummary,
}: {
    request: RefundRequestView;
    children?: ReactNode;
    showReceipt?: boolean;
    refundSummary?: MemberRefundSummary;
}) {
    const quote = request.quote;
    return (
        <section
            className="space-y-5 rounded-2xl border p-5 sm:p-7"
            data-feedback-id={`refund-request-${request.requestId}`}
        >
            <header className="space-y-2">
                <h2 className="text-xl font-semibold">{request.productName}</h2>
                <p className="text-sm">
                    {requestStatus(request.state)}
                    {request.state === "submitted"
                        ? ` · ${request.assignedTo}`
                        : ""}
                </p>
            </header>
            <p className="whitespace-pre-wrap break-words">{request.reason}</p>
            {request.state === "draft" && (
                <p className="text-sm text-muted-foreground">
                    {copy.privateDraft}
                </p>
            )}
            {quote ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt>Payment</dt>
                    <dd>
                        {money(quote.paidAmount, quote.currency, true)} ·{" "}
                        {quote.mode === "test"
                            ? "Test payment"
                            : "Live payment"}
                    </dd>
                    <dt>{refundSummaryCopy.alreadyAtReview}</dt>
                    <dd>
                        {money(
                            quote.alreadyRefundedAmount,
                            quote.currency,
                            true,
                        )}
                    </dd>
                    <dt className="font-semibold">Refund to review</dt>
                    <dd className="font-semibold">
                        {money(quote.amount, quote.currency, true)}
                    </dd>
                </dl>
            ) : (
                <p>{copy.quoteUnavailable}</p>
            )}
            {quote && refundSummary?.kind === "observed" && (
                <p className="text-xs text-muted-foreground">
                    {refundSummaryCopy.reviewAmounts}
                </p>
            )}
            <RefundSummary summary={refundSummary} />
            {request.consequences.classStart && (
                <p className="text-sm">
                    Verified class start:{" "}
                    {classTime(request.consequences.classStart)}
                </p>
            )}
            <div className="space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
                <p>
                    {request.consequences.accessDecision === "policy-pending"
                        ? copy.pendingPolicy
                        : request.consequences.explanation}
                </p>
                <p>{copy.noChange}</p>
            </div>
            <p role="status" className="text-sm">
                {refundStatus(request.refund)}
            </p>
            {request.access === "pending" &&
                request.refund.kind === "refund" &&
                request.refund.status === "succeeded" && (
                    <p role="status">{copy.accessPending}</p>
                )}
            {request.access === "review-required" && (
                <p role="status">{copy.accessReview}</p>
            )}
            {request.access === "ended-booking-review" && (
                <p role="status">{copy.classRosterReview}</p>
            )}
            {request.decisionExplanation && (
                <p className="whitespace-pre-wrap break-words text-sm">
                    Review note: {request.decisionExplanation}
                </p>
            )}
            {showReceipt && (
                <Link
                    href={request.receiptHref}
                    className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
                >
                    {copy.receipt}
                </Link>
            )}
            {children}
        </section>
    );
}
