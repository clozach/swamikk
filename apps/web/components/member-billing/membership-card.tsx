import Link from "next/link";
import { Fragment, type MouseEventHandler } from "react";
import RefundSummary from "@/components/refund-summary";
import { Button } from "@/components/ui/button";
import type { BillingMembershipView } from "@/services/member-billing/types";
import { billingCopy as copy } from "./copy";
import { RefundStatus } from "./consequences";
import { money, date, statusLabel } from "./format";

export function MembershipCard({
    membership,
    readOnly,
    busy,
    onPrepare,
    onReview,
    onReconcile,
}: {
    membership: BillingMembershipView;
    readOnly: boolean;
    busy: boolean;
    onPrepare: MouseEventHandler<HTMLButtonElement>;
    onReview: MouseEventHandler<HTMLButtonElement>;
    onReconcile: MouseEventHandler<HTMLButtonElement>;
}) {
    const operation = membership.cancellation;
    return (
        <article
            tabIndex={-1}
            className="space-y-6 rounded-2xl border bg-card p-5 sm:p-7"
            data-feedback-id={`membership-${membership.membershipId}`}
        >
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h2 className="text-xl font-semibold">
                        {membership.productName}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {membership.planName}
                    </p>
                </div>
                <span className="rounded-full border px-3 py-1 text-sm">
                    {statusLabel(membership.status)}
                </span>
            </header>
            {operation && operation.phase !== "quoted" && (
                <section
                    className="space-y-3 rounded-xl border p-4"
                    aria-live="polite"
                >
                    <h3 className="font-semibold">
                        {operation.phase === "canceled"
                            ? copy.cancelled
                            : copy.cancellationProcessing}
                    </h3>
                    {(operation.phase === "processing" ||
                        operation.phase === "uncertain") && (
                        <p>{copy.cancellationUncertain}</p>
                    )}
                    {operation.phase === "review-required" && (
                        <p>{copy.cancellationReview}</p>
                    )}
                    <p>
                        {operation.access === "ended"
                            ? copy.accessEnded
                            : operation.access === "capped"
                              ? copy.accessCapped
                              : copy.reviewIntro}
                    </p>
                    <RefundStatus value={operation.refund} />
                    {operation.canReconcile && (
                        <Button
                            variant="outline"
                            disabled={readOnly || busy}
                            onClick={onReconcile}
                            className="min-h-11"
                        >
                            {busy ? copy.working : copy.refresh}
                        </Button>
                    )}
                </section>
            )}
            <div className="space-y-3">
                <h3 className="font-semibold">{copy.receipts}</h3>
                {membership.invoices.length ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th scope="col" className="py-3 pr-4">
                                        {copy.date}
                                    </th>
                                    <th scope="col" className="py-3 pr-4">
                                        {copy.amount}
                                    </th>
                                    <th scope="col" className="py-3">
                                        {copy.status}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {membership.invoices.map((invoice) => (
                                    <Fragment key={invoice.invoiceId}>
                                        <tr className="border-b last:border-0">
                                            <td className="py-3 pr-4">
                                                {date(invoice.paidAt)}
                                            </td>
                                            <td className="py-3 pr-4">
                                                <span className="whitespace-nowrap">
                                                    {money(
                                                        invoice.amount,
                                                        invoice.currency,
                                                    )}
                                                </span>
                                                {invoice.mode !== "live" && (
                                                    <span className="mt-1 block text-xs text-muted-foreground">
                                                        {invoice.mode === "test"
                                                            ? copy.test
                                                            : copy.modeUnknown}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3">
                                                {statusLabel(invoice.status)}
                                                {invoice.receipt.kind ===
                                                    "available" && (
                                                    <Link
                                                        href={
                                                            invoice.receipt.href
                                                        }
                                                        className="ml-3 inline-flex min-h-11 items-center underline underline-offset-4"
                                                    >
                                                        {copy.receipt}
                                                    </Link>
                                                )}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td
                                                colSpan={3}
                                                className="pb-4 pt-1"
                                            >
                                                <RefundSummary
                                                    summary={
                                                        invoice.refundSummary
                                                    }
                                                />
                                            </td>
                                        </tr>
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {copy.noReceipts}
                    </p>
                )}
            </div>
            <div className="flex flex-col items-start gap-3 border-t pt-5">
                {membership.cancellationEligibility.kind === "available" &&
                    (!operation || operation.phase === "quoted") && (
                        <Button
                            variant="outline"
                            disabled={readOnly || busy}
                            onClick={onPrepare}
                            className="min-h-11 h-auto whitespace-normal text-left"
                        >
                            {busy
                                ? copy.preparing
                                : operation
                                  ? copy.reviewAgain
                                  : copy.cancel}
                        </Button>
                    )}
                {operation?.phase === "quoted" && (
                    <Button
                        variant="ghost"
                        onClick={onReview}
                        className="min-h-11"
                    >
                        {copy.reviewTitle}
                    </Button>
                )}
                {membership.cancellationEligibility.kind ===
                    "review-required" && (
                    <p className="text-sm text-muted-foreground">
                        {copy.humanReview}
                    </p>
                )}
                <Link
                    href="/p/contact"
                    className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
                >
                    {copy.help}
                </Link>
            </div>
        </article>
    );
}
