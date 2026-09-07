"use client";

import { useEffect, useState } from "react";
import type {
    ContactPreferences,
    ContactPreferencesInput,
} from "@courselit/common-models";
import { contactPreferencesCopy as copy } from "@/config/strings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ContactPreferencesForm from "./form";

type State =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; value: ContactPreferences };

export default function ContactPreferencesPanel({
    readOnly,
}: {
    readOnly: boolean;
}) {
    const [state, setState] = useState<State>({ kind: "loading" });
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const abort = new AbortController();
        fetch("/api/contact-preferences", {
            cache: "no-store",
            signal: abort.signal,
        })
            .then(async (response) => {
                if (!response.ok) throw new Error();
                return response.json();
            })
            .then((value) => setState({ kind: "ready", value }))
            .catch(() => {
                if (!abort.signal.aborted) setState({ kind: "error" });
            });
        return () => abort.abort();
    }, [attempt]);
    function reload() {
        setState({ kind: "loading" });
        setAttempt((value) => value + 1);
    }
    async function save(
        input: ContactPreferencesInput,
    ): Promise<ContactPreferences> {
        const response = await fetch("/api/contact-preferences", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
        const result = await response.json();
        if (!response.ok)
            throw new Error(result.error?.message || copy.saveFailed);
        return result;
    }
    return (
        <Card className="mt-6" id="contact-preferences">
            <CardHeader>
                <CardTitle>{copy.title}</CardTitle>
            </CardHeader>
            <CardContent>
                {state.kind === "loading" && (
                    <p role="status">{copy.loading}</p>
                )}
                {state.kind === "error" && (
                    <div role="alert">
                        <p>{copy.failed}</p>
                        <button className="min-h-11 underline" onClick={reload}>
                            {copy.retry}
                        </button>
                    </div>
                )}
                {state.kind === "ready" && (
                    <ContactPreferencesForm
                        initial={state.value}
                        readOnly={readOnly}
                        onSave={save}
                        onReload={reload}
                    />
                )}
            </CardContent>
        </Card>
    );
}
