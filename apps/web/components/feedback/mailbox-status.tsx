"use client";
import { useState } from "react";
import type {
    ContextualFeedback,
    FeedbackNotification,
} from "@courselit/common-models";
import { Button } from "@/components/ui/button";
import { feedbackRequest } from "./api";
import { mailboxCopy as copy } from "./mailbox-copy";

export function notificationLabel(notification?: FeedbackNotification) {
    if (!notification) return copy.notQueued;
    switch (notification.kind) {
        case "pending":
            return copy.pending;
        case "sending":
            return copy.sending;
        case "accepted":
            return notification.evidence === "operator"
                ? copy.confirmed
                : copy.accepted;
        case "uncertain":
            return copy.uncertain;
        case "failed":
            return copy[notification.reason];
    }
}

export default function MailboxStatus({
    comment,
    onChanged,
}: {
    comment: ContextualFeedback;
    onChanged: () => Promise<void>;
}) {
    const [verified, setVerified] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const notification = comment.notification;
    async function act(
        action: "retry" | "confirm-received" | "confirm-not-sent",
    ) {
        setBusy(true);
        setNotice("");
        try {
            await feedbackRequest(
                `/api/feedback-mailbox/${encodeURIComponent(comment.id)}`,
                {
                    action,
                    expectedUpdatedAt: comment.updatedAt,
                    ...(action === "retry" ? {} : { verified }),
                },
            );
            setNotice(copy.updated);
            await onChanged();
        } catch (error) {
            setNotice(error instanceof Error ? error.message : copy.conflict);
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="mt-4 rounded-lg bg-muted/40 p-3 text-sm">
            <p className="font-medium">{notificationLabel(notification)}</p>
            {notification?.kind === "accepted" && (
                <p className="mt-1">{copy.acceptedHelp}</p>
            )}
            {notification && "recipient" in notification && (
                <p className="mt-1 break-all">{notification.recipient}</p>
            )}
            {notification &&
                "nextAttemptAt" in notification &&
                notification.nextAttemptAt && (
                    <p className="mt-1">
                        Next attempt:{" "}
                        {new Date(notification.nextAttemptAt).toLocaleString()}
                    </p>
                )}
            {comment.state === "open" &&
                (!notification || notification.kind === "failed") && (
                    <Button
                        variant="outline"
                        className="mt-3 min-h-11"
                        disabled={busy}
                        onClick={() => act("retry")}
                    >
                        {copy.retry}
                    </Button>
                )}
            {notification?.kind === "uncertain" && (
                <div className="mt-3 grid gap-3">
                    <p className="break-all">
                        Message reference: feedback-{notification.attemptId}
                        @courselit.local
                    </p>
                    <label className="flex gap-3 min-h-11 items-start">
                        <input
                            type="checkbox"
                            checked={verified}
                            onChange={(e) => setVerified(e.target.checked)}
                            className="mt-1"
                        />
                        {copy.verify}
                    </label>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="outline"
                            className="min-h-11"
                            disabled={busy || !verified}
                            onClick={() => act("confirm-received")}
                        >
                            {copy.received}
                        </Button>
                        {comment.state === "open" && (
                            <Button
                                variant="outline"
                                className="min-h-11"
                                disabled={busy || !verified}
                                onClick={() => act("confirm-not-sent")}
                            >
                                {copy.unsent}
                            </Button>
                        )}
                    </div>
                </div>
            )}
            {notice && (
                <p role="status" className="mt-2">
                    {notice}
                </p>
            )}
        </div>
    );
}
