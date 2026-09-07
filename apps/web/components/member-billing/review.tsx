import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import type { BillingCancellationView } from "@/services/member-billing/types";
import { billingCopy as copy } from "./copy";
import { Consequences, RefundStatus } from "./consequences";
import { date, money } from "./format";

export function CancellationReview({
    operation,
    productName,
    busy,
    readOnly,
    onClose,
    onConfirm,
    onReconcile,
}: {
    operation: BillingCancellationView;
    productName: string;
    busy: boolean;
    readOnly: boolean;
    onClose: () => void;
    onConfirm: () => void;
    onReconcile: () => void;
}) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (operation.phase !== "quoted") return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [operation.phase]);
    const quote = operation.quote;
    const isQuote = operation.phase === "quoted";
    const expired = Date.parse(quote.expiresAt) <= now;
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
                <DialogTitle>
                    {isQuote
                        ? copy.reviewTitle
                        : operation.phase === "canceled"
                          ? copy.cancelled
                          : copy.cancellationProcessing}
                </DialogTitle>
                <DialogDescription>
                    {productName}.{" "}
                    {isQuote
                        ? copy.reviewIntro
                        : operation.phase === "canceled"
                          ? copy.accessEnded
                          : copy.cancellationUncertain}
                </DialogDescription>
                {quote.mode === "test" && (
                    <p className="w-fit rounded-full border px-3 py-1 text-sm font-medium">
                        {copy.test}
                    </p>
                )}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-muted/40 p-4 text-sm [&>dd]:text-right">
                    <dt>{copy.period}</dt>
                    <dd>
                        {date(quote.period.start)} – {date(quote.period.end)}
                    </dd>
                    <dt>{copy.paid}</dt>
                    <dd>{money(quote.paidAmount, quote.currency, true)}</dd>
                    <dt>
                        {isQuote
                            ? copy.alreadyRefunded
                            : copy.refundedBeforeRequest}
                    </dt>
                    <dd>
                        {money(
                            quote.alreadyRefundedAmount,
                            quote.currency,
                            true,
                        )}
                    </dd>
                    <dt className="font-semibold">
                        {isQuote ? copy.refund : copy.refundReviewed}
                    </dt>
                    <dd className="font-semibold">
                        {money(quote.refundAmount, quote.currency, true)}
                    </dd>
                </dl>
                <p className="text-sm leading-relaxed">
                    {quote.payment === "unpaid"
                        ? copy.unpaidMonth
                        : copy.fullMonth}
                </p>
                <Consequences value={quote.consequences} />
                {operation.access === "capped" && (
                    <p role="status">{copy.accessCapped}</p>
                )}
                {operation.access === "ended" && (
                    <p role="status">{copy.accessEnded}</p>
                )}
                {!isQuote && <RefundStatus value={operation.refund} />}
                {isQuote && expired && <p role="alert">{copy.expired}</p>}
                <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:justify-end">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="min-h-11"
                    >
                        {isQuote ? copy.keep : copy.close}
                    </Button>
                    {isQuote ? (
                        <Button
                            disabled={
                                readOnly ||
                                busy ||
                                expired ||
                                !operation.canConfirm
                            }
                            onClick={onConfirm}
                            className="min-h-11 h-auto whitespace-normal"
                        >
                            {busy ? copy.working : copy.confirm}
                        </Button>
                    ) : (
                        operation.canReconcile && (
                            <Button
                                disabled={readOnly || busy}
                                onClick={onReconcile}
                                className="min-h-11"
                            >
                                {busy ? copy.working : copy.refresh}
                            </Button>
                        )
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
