"use client";
import { useId } from "react";
import Link from "next/link";
import type { useClassChoices } from "./use-class-choices";
export { useClassChoices } from "./use-class-choices";

export function ClassChoiceControl({
    state,
}: {
    state: ReturnType<typeof useClassChoices>;
}) {
    const id = useId();
    if (state.status.kind === "paid-review")
        return (
            <div role="status">
                <p>Payment recorded. Your class booking needs review.</p>
                <p>
                    Selected date:{" "}
                    {new Date(state.status.selectedStart).toLocaleString(
                        "en-NZ",
                        {
                            timeZone: "UTC",
                            dateStyle: "medium",
                            timeStyle: "short",
                        },
                    )}{" "}
                    UTC
                </p>
                <p>
                    {state.status.membership === "active"
                        ? "Your product membership is active."
                        : "Your product membership still needs confirmation."}{" "}
                    Your class roster has not been confirmed. Please contact us
                    before paying again.
                </p>
                <p>Reference: {state.status.reference}</p>
                <Link href="/p/contact" className="underline">
                    Get booking help
                </Link>
            </div>
        );
    if (state.status.kind === "pending")
        return (
            <div role="status">
                <p>
                    Your checkout still needs confirmation. Please contact us
                    before starting another payment.
                </p>
                <p>Reference: {state.status.reference}</p>
                <Link href="/p/contact" className="underline">
                    Get booking help
                </Link>
            </div>
        );
    if (state.offer.kind === "ordinary") return null;
    if (state.offer.kind === "loading")
        return <p role="status">Checking class dates…</p>;
    if (state.offer.kind === "unavailable")
        return (
            <div role="alert">
                <p>Class dates could not be checked.</p>
                <button
                    type="button"
                    onClick={state.refresh}
                    className="underline"
                >
                    Check dates again
                </button>
            </div>
        );

    if (!state.offer.choices.length)
        return (
            <p>
                No class dates are open for booking.{" "}
                <Link href="/p/contact" className="underline">
                    Contact us
                </Link>
            </p>
        );
    return (
        <fieldset className="space-y-3">
            <legend className="font-semibold">Choose a class date</legend>
            <label className="sr-only" htmlFor={id}>
                Class date (UTC)
            </label>
            <select
                id={id}
                className="w-full rounded border bg-background p-3"
                value={state.choice?.cohortId || ""}
                onChange={(event) => {
                    const choice =
                        state.offer.kind === "class" &&
                        state.offer.choices.find(
                            (item) => item.cohortId === event.target.value,
                        );
                    state.choose(
                        choice
                            ? {
                                  cohortId: choice.cohortId,
                                  fingerprint: choice.fingerprint,
                              }
                            : undefined,
                    );
                }}
            >
                <option value="">Choose a date</option>
                {state.offer.choices.map((item) => (
                    <option key={item.cohortId} value={item.cohortId}>
                        {item.name} —{" "}
                        {new Date(item.startAt).toLocaleString("en-NZ", {
                            timeZone: "UTC",
                            dateStyle: "medium",
                            timeStyle: "short",
                        })}{" "}
                        UTC
                    </option>
                ))}
            </select>
            <p className="text-sm">
                This payment is for the selected date. Times are shown in UTC.
            </p>
        </fieldset>
    );
}
