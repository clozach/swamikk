import { useEffect, useRef, useState } from "react";
import type {
    BillingCancellationView,
    MemberBillingCommand,
    MemberBillingCommandResult,
    MemberBillingView,
} from "@/services/member-billing/types";
import { billingCopy as copy } from "./copy";

type State =
    | { kind: "loading" }
    | { kind: "ready"; view: MemberBillingView }
    | { kind: "failed" };
type Review = {
    membershipId: string;
    productName: string;
    operation: BillingCancellationView;
};

/** One mounted identity owns its reads and commands; the parent keys that boundary. */
export function useBilling(mimicReadOnly: boolean) {
    const [state, setState] = useState<State>({ kind: "loading" });
    const [review, setReview] = useState<Review | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState("");
    const [revision, setRevision] = useState(0);
    const mounted = useRef(true);
    const inFlight = useRef(false);
    const readOnly =
        mimicReadOnly || (state.kind === "ready" && state.view.readOnly);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        setState({ kind: "loading" });
        setReview(null);
        setMessage("");
        fetch("/api/member-billing", {
            cache: "no-store",
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) throw new Error();
                return response.json() as Promise<MemberBillingView>;
            })
            .then((view) => {
                if (!controller.signal.aborted)
                    setState({ kind: "ready", view });
            })
            .catch(() => {
                if (!controller.signal.aborted) setState({ kind: "failed" });
            });
        return () => controller.abort();
    }, [revision]);

    async function command(
        input: MemberBillingCommand,
        membershipId: string,
        productName: string,
    ) {
        if (readOnly || state.kind !== "ready" || inFlight.current) return;
        inFlight.current = true;
        setBusy(membershipId);
        setMessage("");
        try {
            const response = await fetch("/api/member-billing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            });
            if (!response.ok) throw new Error();
            const result =
                (await response.json()) as MemberBillingCommandResult;
            if (!mounted.current) return;
            if (result.kind === "operation") {
                setReview({
                    membershipId,
                    productName,
                    operation: result.operation,
                });
                setState((current) =>
                    current.kind === "ready"
                        ? {
                              kind: "ready",
                              view: {
                                  ...current.view,
                                  memberships: current.view.memberships.map(
                                      (membership) =>
                                          membership.membershipId ===
                                          membershipId
                                              ? {
                                                    ...membership,
                                                    cancellation:
                                                        result.operation,
                                                    status:
                                                        result.operation
                                                            .access === "ended"
                                                            ? "expired"
                                                            : membership.status,
                                                }
                                              : membership,
                                  ),
                              },
                          }
                        : current,
                );
            } else {
                setMessage(
                    result.kind === "review-required"
                        ? copy.humanReview
                        : copy.requestFailed,
                );
            }
        } catch {
            if (mounted.current) setMessage(copy.requestFailed);
        } finally {
            inFlight.current = false;
            if (mounted.current) setBusy(null);
        }
    }
    return {
        state,
        review,
        setReview,
        busy,
        message,
        readOnly,
        command,
        refresh: () => setRevision((n) => n + 1),
    };
}
