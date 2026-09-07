import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
    RefundRequestCommand,
    RefundRequestView,
} from "@/services/refund-requests/types";
import { BookingForm } from "./booking-form";
import { refundCopy as copy } from "./copy";

export function OperatorActions({
    request,
    busy,
    command,
}: {
    request: RefundRequestView;
    busy: boolean;
    command: (input: RefundRequestCommand) => Promise<boolean>;
}) {
    const [explanation, setExplanation] = useState("");
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!request.quote) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [request.quote]);
    const expired =
        !!request.quote && new Date(request.quote.expiresAt).getTime() <= now;
    const mayReview =
        ["submitted", "review-required"].includes(request.state) &&
        request.refund.kind === "not-started";
    return (
        <div className="space-y-4 border-t pt-5">
            {expired && mayReview && (
                <p role="alert" className="text-sm">
                    {copy.expired}
                </p>
            )}
            {mayReview && (
                <>
                    <div className="flex flex-wrap gap-3">
                        <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                                void command({
                                    action: "review",
                                    requestId: request.requestId,
                                })
                            }
                        >
                            {copy.paymentReview}
                        </Button>
                        <BookingForm
                            invoiceId={request.invoiceId}
                            busy={busy}
                            command={command}
                        />
                    </div>
                    <label className="block space-y-2">
                        <span>{copy.explanation}</span>
                        <textarea
                            className="min-h-24 w-full rounded-lg border bg-background p-3"
                            maxLength={2000}
                            value={explanation}
                            onChange={(event) =>
                                setExplanation(event.target.value)
                            }
                            disabled={busy}
                        />
                    </label>
                    <div className="flex flex-wrap gap-3">
                        {(
                            [
                                [
                                    "approve",
                                    copy.approve,
                                    request.canApprove && !expired,
                                ],
                                ["decline", copy.decline, request.canDecline],
                                [
                                    "escalate",
                                    copy.escalate,
                                    request.canEscalate,
                                ],
                            ] as const
                        ).map(([action, label, enabled]) => (
                            <Button
                                key={action}
                                variant={
                                    action === "approve" ? "default" : "outline"
                                }
                                disabled={
                                    busy || !enabled || !explanation.trim()
                                }
                                onClick={() =>
                                    void command({
                                        action,
                                        requestId: request.requestId,
                                        reviewHash: request.reviewHash,
                                        explanation: explanation.trim(),
                                    })
                                }
                            >
                                {label}
                            </Button>
                        ))}
                    </div>
                </>
            )}
            {request.canReconcile && (
                <Button
                    disabled={busy}
                    variant="outline"
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
        </div>
    );
}
