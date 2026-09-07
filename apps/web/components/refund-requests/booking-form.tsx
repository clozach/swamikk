import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
    RefundBookingChoicesView,
    RefundRequestCommand,
} from "@/services/refund-requests/types";
import { classTime, refundCopy as copy } from "./copy";

export function BookingForm({
    invoiceId,
    busy,
    command,
}: {
    invoiceId: string;
    busy: boolean;
    command: (input: RefundRequestCommand) => Promise<boolean>;
}) {
    const [opened, setOpened] = useState(false),
        [choices, setChoices] = useState<RefundBookingChoicesView | null>(null);
    const [cohortId, setCohortId] = useState(""),
        [explanation, setExplanation] = useState("");
    const [verified, setVerified] = useState(false),
        [failed, setFailed] = useState(false);
    useEffect(() => {
        if (!opened) return;
        const controller = new AbortController();
        fetch(
            `/api/refund-requests/review?invoiceId=${encodeURIComponent(invoiceId)}`,
            { cache: "no-store", signal: controller.signal },
        )
            .then(async (response) => {
                if (!response.ok) throw new Error();
                const result =
                    (await response.json()) as RefundBookingChoicesView;
                if (!controller.signal.aborted) setChoices(result);
            })
            .catch(() => {
                if (!controller.signal.aborted) setFailed(true);
            });
        return () => controller.abort();
    }, [opened, invoiceId]);
    if (!opened)
        return (
            <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                    setFailed(false);
                    setChoices(null);
                    setCohortId("");
                    setVerified(false);
                    setOpened(true);
                }}
            >
                {copy.booking}
            </Button>
        );
    const dated = choices?.choices.filter((choice) => choice.startAt) || [];
    return (
        <form
            className="space-y-4 rounded-xl border p-4"
            onSubmit={async (event) => {
                event.preventDefault();
                if (
                    await command({
                        action: "verify-class",
                        invoiceId,
                        cohortId,
                        explanation: explanation.trim(),
                        bookingVerified: true,
                    })
                )
                    setOpened(false);
            }}
        >
            <h3 className="font-semibold">{copy.booking}</h3>
            <p className="text-sm">{copy.bookingHelp}</p>
            {failed ? (
                <p role="alert">
                    The class bookings could not be loaded. Close and reopen
                    this form to try again.
                </p>
            ) : !choices ? (
                <p role="status">Loading class bookings…</p>
            ) : !dated.length ? (
                <p>{copy.noClasses}</p>
            ) : (
                <>
                    <label className="block space-y-2">
                        <span>Actual class booking</span>
                        <select
                            className="min-h-11 w-full rounded-lg border bg-background p-2"
                            value={cohortId}
                            onChange={(event) => {
                                setCohortId(event.target.value);
                                setVerified(false);
                            }}
                            required
                            disabled={busy}
                        >
                            <option value="">Choose a class</option>
                            {dated.map((choice) => (
                                <option
                                    key={choice.cohortId}
                                    value={choice.cohortId}
                                >
                                    {choice.name} · {classTime(choice.startAt!)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block space-y-2">
                        <span>{copy.bookingEvidence}</span>
                        <textarea
                            className="min-h-24 w-full rounded-lg border bg-background p-3"
                            value={explanation}
                            onChange={(event) =>
                                setExplanation(event.target.value)
                            }
                            maxLength={2000}
                            required
                            disabled={busy}
                        />
                    </label>
                    <label className="flex min-h-11 items-center gap-3">
                        <input
                            type="checkbox"
                            checked={verified}
                            onChange={(event) =>
                                setVerified(event.target.checked)
                            }
                            disabled={busy}
                        />
                        <span>{copy.bookingConfirm}</span>
                    </label>
                    <Button
                        type="submit"
                        disabled={
                            busy ||
                            !cohortId ||
                            !verified ||
                            !explanation.trim()
                        }
                    >
                        {copy.bookingSave}
                    </Button>
                </>
            )}
            <Button
                variant="ghost"
                type="button"
                disabled={busy}
                onClick={() => setOpened(false)}
            >
                Close booking review
            </Button>
        </form>
    );
}
