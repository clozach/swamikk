import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
    fromStripeAmount,
    stripeCurrencyFactor,
    toStripeAmount,
} from "@/payments-new/stripe-currency";
import type {
    RefundRequestCommand,
    RefundRequestView,
} from "@/services/refund-requests/types";
import { refundCopy as copy } from "./copy";

export function reviewedAmount(value: string, currency: string) {
    if (!/^\d+(\.\d+)?$/.test(value.trim())) return null;
    const number = Number(value);
    try {
        const amount = toStripeAmount(number, currency);
        return amount > 0 && amount / stripeCurrencyFactor(currency) === number
            ? amount
            : null;
    } catch {
        return null;
    }
}

export function AmountReview({
    request,
    busy,
    command,
    onDirty,
}: {
    request: RefundRequestView;
    busy: boolean;
    command: (input: RefundRequestCommand) => Promise<boolean>;
    onDirty: (dirty: boolean) => void;
}) {
    const quote = request.quote;
    const schema = useMemo(
        () =>
            z.object({
                amount: z.string().refine((value) => {
                    if (!quote) return false;
                    const amount = reviewedAmount(value, quote.currency);
                    return (
                        amount !== null &&
                        amount <= (quote.remainingAmount ?? quote.amount)
                    );
                }, copy.invalidAmount),
            }),
        [quote],
    );
    const {
        register,
        handleSubmit,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<{ amount: string }>({
        resolver: zodResolver(schema),
        values: {
            amount: quote
                ? String(fromStripeAmount(quote.amount, quote.currency))
                : "",
        },
    });
    const value = watch("amount");
    useEffect(() => {
        onDirty(
            !!quote && reviewedAmount(value, quote.currency) !== quote.amount,
        );
    }, [value, quote, onDirty]);
    if (!quote) return null;
    return (
        <form
            className="space-y-2"
            onSubmit={handleSubmit(async ({ amount }) => {
                await command({
                    action: "review",
                    requestId: request.requestId,
                    amount: reviewedAmount(amount, quote.currency)!,
                });
            })}
        >
            <label className="block space-y-1">
                <span>
                    {copy.amount} ({quote.currency.toUpperCase()})
                </span>
                <input
                    {...register("amount")}
                    inputMode="decimal"
                    className="block min-h-11 w-full rounded border bg-background p-2"
                    disabled={busy}
                />
            </label>
            <p className="text-sm text-muted-foreground">{copy.amountHelp}</p>
            {errors.amount && <p role="alert">{errors.amount.message}</p>}
            <Button
                type="submit"
                variant="outline"
                disabled={busy || isSubmitting}
            >
                {copy.reviewAmount}
            </Button>
        </form>
    );
}
