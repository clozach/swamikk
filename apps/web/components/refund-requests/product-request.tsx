import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { money } from "@/components/member-billing/format";
import type {
    RefundProductView,
    RefundRequestCommand,
} from "@/services/refund-requests/types";
import { RequestCard } from "./request-card";
import { refundCopy as copy } from "./copy";
import RefundSummary from "@/components/refund-summary";
export function ProductRequest({
    product,
    readOnly,
    busy,
    command,
}: {
    product: RefundProductView;
    readOnly: boolean;
    busy: boolean;
    command: (input: RefundRequestCommand) => Promise<void>;
}) {
    const [reason, setReason] = useState(product.request?.reason || "");
    const request = product.request;
    const draft = !request || request.state === "draft";
    const reasonUnchanged = !!request && reason.trim() === request.reason;
    const editor =
        !readOnly && draft ? (
            <form
                className="space-y-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    void command({
                        action: "prepare",
                        invoiceId: product.invoiceId,
                        reason: reason.trim(),
                    });
                }}
            >
                <label className="block space-y-2">
                    <span>{copy.reason}</span>
                    <textarea
                        className="min-h-28 w-full rounded-lg border bg-background p-3"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        required
                        maxLength={2000}
                        disabled={busy}
                    />
                </label>
                <p className="text-sm text-muted-foreground">
                    {copy.privateDraft}
                </p>
                <div className="flex flex-wrap gap-3">
                    <Button
                        type="submit"
                        variant="outline"
                        disabled={busy || !reason.trim()}
                    >
                        {copy.prepare}
                    </Button>
                    {request?.canSubmit && (
                        <Button
                            type="button"
                            disabled={busy || !reasonUnchanged}
                            onClick={() =>
                                void command({
                                    action: "submit",
                                    requestId: request.requestId,
                                    reviewHash: request.reviewHash,
                                })
                            }
                        >
                            {copy.submit}
                        </Button>
                    )}
                </div>
                {request && !reasonUnchanged && (
                    <p className="text-sm">
                        Review your edited request before submitting it.
                    </p>
                )}
            </form>
        ) : null;
    if (request)
        return (
            <RequestCard
                request={request}
                refundSummary={product.refundSummary}
            >
                {editor}
                {!readOnly && request.canReconcile && (
                    <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                            void command({
                                action: "reconcile",
                                requestId: request.requestId,
                                reviewHash: request.reviewHash,
                            })
                        }
                    >
                        Check existing refund
                    </Button>
                )}
            </RequestCard>
        );
    return (
        <section className="space-y-4 rounded-2xl border p-5 sm:p-7">
            <h2 className="text-xl font-semibold">{product.productName}</h2>
            <p>
                {money(product.amount, product.currency)} ·{" "}
                {product.mode === "unknown"
                    ? "Payment mode unrecorded"
                    : product.mode === "test"
                      ? "Test payment"
                      : "Live payment"}
            </p>
            <RefundSummary summary={product.refundSummary} />
            <Link
                href={product.receiptHref}
                className="inline-flex min-h-11 items-center text-sm underline"
            >
                {copy.receipt}
            </Link>
            {editor}
        </section>
    );
}
