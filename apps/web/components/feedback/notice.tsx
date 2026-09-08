import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { feedbackUi as copy } from "@config/strings";

/** Every new message gets its own lifetime, even when its text repeats. */
export function useFeedbackNotice() {
    const [notice, setNotice] = useState<{ message: string } | null>(null);
    const show = useCallback((message: string) => {
        setNotice(message ? { message } : null);
    }, []);
    useEffect(() => {
        if (!notice || ![copy.sent, copy.copied].includes(notice.message))
            return;
        const timer = window.setTimeout(() => setNotice(null), 5000);
        return () => window.clearTimeout(timer);
    }, [notice]);
    return [notice?.message || "", show] as const;
}

interface FeedbackNoticeProps {
    message: string;
    onDismiss: () => void;
}

export function FeedbackNotice({ message, onDismiss }: FeedbackNoticeProps) {
    return (
        <div
            data-feedback-ui
            className="kk-feedback-notice border bg-background text-foreground shadow-lg"
        >
            <span role="status">{message}</span>
            <button type="button" aria-label={copy.close} onClick={onDismiss}>
                <X size={20} aria-hidden="true" />
            </button>
        </div>
    );
}
