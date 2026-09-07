"use client";
import { useEffect, useState } from "react";
import type { FeedbackMailboxView } from "@courselit/common-models";
import { feedbackRequest } from "./api";
import { Button } from "@/components/ui/button";
import { mailboxCopy as copy } from "./mailbox-copy";

type LoadState =
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; view: FeedbackMailboxView };

export default function MailboxSettings() {
    const [load, setLoad] = useState<LoadState>({ kind: "loading" });
    const view = load.kind === "ready" ? load.view : null;
    const [enabled, setEnabled] = useState(false);
    const [recipient, setRecipient] = useState("");
    const [interval, setInterval] = useState(60);
    const [approved, setApproved] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    useEffect(() => {
        let active = true;
        feedbackRequest<FeedbackMailboxView>("/api/feedback-mailbox")
            .then((result) => {
                if (!active) return;
                setLoad({ kind: "ready", view: result });
                setEnabled(result.settings.kind === "enabled");
                setRecipient(
                    result.settings.kind === "enabled"
                        ? result.settings.recipient
                        : result.ownerEmail,
                );
                setInterval(
                    result.settings.kind === "enabled"
                        ? result.settings.intervalMinutes
                        : 60,
                );
            })
            .catch(() => {
                if (active) {
                    setLoad({ kind: "error" });
                    setNotice(copy.failed);
                }
            });
        return () => {
            active = false;
        };
    }, []);
    async function save(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        setNotice("");
        try {
            const result = await feedbackRequest<FeedbackMailboxView>(
                "/api/feedback-mailbox",
                enabled
                    ? {
                          kind: "enabled",
                          recipient,
                          intervalMinutes: interval,
                          approvedPrivateRecipient: approved,
                      }
                    : { kind: "off" },
            );
            setLoad({ kind: "ready", view: result });
            setApproved(false);
            setNotice(copy.saved);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : copy.conflict);
        } finally {
            setBusy(false);
        }
    }
    return (
        <section
            className="rounded-2xl border p-6 mb-8"
            aria-labelledby="mailbox-title"
        >
            <h2 id="mailbox-title" className="text-xl font-semibold">
                {copy.title}
            </h2>
            <p className="font-medium mt-3">
                {view
                    ? view.settings.kind === "enabled"
                        ? copy.on
                        : copy.off
                    : load.kind === "error"
                      ? "Delivery status unavailable"
                      : "Loading delivery status…"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{copy.guide}</p>
            <p className="mt-2 text-sm text-muted-foreground">
                {copy.automation}
            </p>
            {view?.canConfigure ? (
                <form onSubmit={save} className="grid gap-4 mt-4 max-w-xl">
                    <label className="flex items-center gap-3 min-h-11">
                        <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => {
                                setEnabled(e.target.checked);
                                setApproved(false);
                            }}
                        />
                        {copy.enable}
                    </label>
                    {enabled && (
                        <>
                            <label className="grid gap-2">
                                {copy.recipient}
                                <input
                                    type="email"
                                    required
                                    maxLength={254}
                                    className="border rounded p-3"
                                    value={recipient}
                                    onChange={(e) => {
                                        setRecipient(e.target.value);
                                        setApproved(false);
                                    }}
                                />
                            </label>
                            <label className="grid gap-2">
                                {copy.interval}
                                <input
                                    type="number"
                                    required
                                    min={1}
                                    max={10080}
                                    className="border rounded p-3"
                                    value={interval}
                                    onChange={(e) =>
                                        setInterval(Number(e.target.value))
                                    }
                                />
                            </label>
                            <p className="text-sm text-muted-foreground">
                                {copy.intervalHelp}
                            </p>
                            <label className="flex items-start gap-3 min-h-11">
                                <input
                                    className="mt-1"
                                    type="checkbox"
                                    required
                                    checked={approved}
                                    onChange={(e) =>
                                        setApproved(e.target.checked)
                                    }
                                />
                                {copy.approve}
                            </label>
                        </>
                    )}
                    <Button
                        className="min-h-11 justify-self-start"
                        disabled={busy || (enabled && !approved)}
                    >
                        {copy.save}
                    </Button>
                </form>
            ) : (
                view && <p className="mt-3 text-sm">{copy.noSettings}</p>
            )}
            {notice && (
                <p role="status" className="mt-3">
                    {notice}
                </p>
            )}
        </section>
    );
}
