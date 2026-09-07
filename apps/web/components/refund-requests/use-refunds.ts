import { useEffect, useRef, useState } from "react";
import type { RefundRequestCommand } from "@/services/refund-requests/types";
import { refundCopy as copy } from "./copy";

export function useRefunds<T>(url: string, readOnly: boolean, enabled = true) {
    const [view, setView] = useState<T | null>(null);
    const [loading, setLoading] = useState(enabled);
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [revision, setRevision] = useState(0);
    const mounted = useRef(false),
        inFlight = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    useEffect(() => {
        if (!enabled) return;
        const controller = new AbortController();
        setLoading(true);
        fetch(url, { cache: "no-store", signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error();
                const result = (await response.json()) as T;
                if (!controller.signal.aborted) {
                    setView(result);
                    setMessage("");
                }
            })
            .catch(() => {
                if (!controller.signal.aborted) setMessage(copy.failed);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [url, revision, enabled]);
    async function command<R>(
        input: RefundRequestCommand,
    ): Promise<R | undefined> {
        if (readOnly || !enabled || inFlight.current) return;
        inFlight.current = true;
        setBusy(true);
        setMessage("");
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
            });
            if (!response.ok) throw new Error();
            const result = (await response.json()) as R;
            return mounted.current ? result : undefined;
        } catch {
            if (mounted.current) setMessage(copy.actionFailed);
        } finally {
            inFlight.current = false;
            if (mounted.current) setBusy(false);
        }
    }
    return {
        view,
        setView,
        loading,
        message,
        busy,
        command,
        refresh: () => setRevision((n) => n + 1),
    };
}
