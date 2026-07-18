"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

const QUERY_KEY = "blue-logged-in";
const STORAGE_KEY = "anahata:private-palette";

/* The flag is genuinely external state — it outlives any one component and is
 * backed by sessionStorage — so it lives in a small store that components
 * subscribe to, rather than in a useState that an effect writes into. That
 * also gives useSyncExternalStore a server snapshot to render, which is what
 * keeps the first paint from disagreeing with the client. */
let enabled = false;
const listeners = new Set<() => void>();

function readStored(): boolean {
    try {
        return window.sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
        // Private browsing can refuse sessionStorage entirely.
        return false;
    }
}

function setEnabled(next: boolean, persist: boolean) {
    if (persist) {
        try {
            window.sessionStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch {
            // Not persistable here; the flag still applies to this page load.
        }
    }
    if (next === enabled) {
        return;
    }
    enabled = next;
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * Feature flag for the cool-palette treatment of the signed-in pages.
 *
 * Turn it on with `?blue-logged-in=1` on any dashboard URL, off with
 * `?blue-logged-in=0`. The choice is remembered for the rest of the browser
 * session, because a flag that survives only one URL cannot really be
 * judged: evaluating a palette means clicking around in it, and re-appending
 * a query string to every link would be its own kind of noise. sessionStorage
 * rather than localStorage, so it dies with the tab and can never quietly
 * become a setting nobody remembers turning on.
 *
 * Returns the class name to apply, or "" — so callers can drop it straight
 * into cn() without a conditional.
 */
export function usePrivatePalette(): string {
    const searchParams = useSearchParams();
    const param = searchParams?.get(QUERY_KEY);
    const active = useSyncExternalStore(
        subscribe,
        () => enabled,
        () => false,
    );

    useEffect(() => {
        if (param === "1" || param === "0") {
            setEnabled(param === "1", true);
        } else {
            setEnabled(readStored(), false);
        }
    }, [param]);

    return active ? "anahata-private-blue" : "";
}
