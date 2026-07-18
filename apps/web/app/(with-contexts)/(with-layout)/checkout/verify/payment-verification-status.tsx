import { Clock, Loader2, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { Button, Header2, Text1 } from "@courselit/page-primitives";
import { InvoicesStatus } from "@courselit/common-models";
import type { ThemeStyle } from "@courselit/page-models";

interface PaymentVerificationStatusProps {
    status: InvoicesStatus;
    onRetryVerification: () => Promise<void>;
    loading: boolean;
    theme?: ThemeStyle;
}

export function PaymentVerificationStatus({
    status,
    onRetryVerification,
    loading,
    theme,
}: PaymentVerificationStatusProps) {
    if (loading) {
        return (
            <div className="flex flex-col items-center space-y-4">
                <Loader2
                    className="h-12 w-12 animate-spin text-muted-foreground"
                    aria-hidden="true"
                />
                <Header2 theme={theme}>Verifying your payment…</Header2>
                <Text1 theme={theme} className="text-muted-foreground">
                    This only takes a moment.
                </Text1>
            </div>
        );
    }

    if (status === "failed") {
        return (
            <div className="flex flex-col items-center space-y-4">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <X
                        className="h-8 w-8 text-destructive"
                        aria-hidden="true"
                    />
                </span>
                <Header2 theme={theme}>
                    We couldn&apos;t verify your payment
                </Header2>
                <Text1 theme={theme} className="text-muted-foreground">
                    If you were charged, it can take a few minutes to come
                    through. Try again, or reach out and we&apos;ll help sort it
                    out.
                </Text1>
                <div className="flex flex-wrap items-center justify-center gap-4">
                    <Button theme={theme} onClick={onRetryVerification}>
                        <RefreshCw
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                        />
                        Try again
                    </Button>
                    <Button theme={theme} variant="secondary" asChild>
                        <Link href="/dashboard/support">Contact support</Link>
                    </Button>
                </div>
            </div>
        );
    }

    // status === "pending" and not loading: payment initiated but not yet confirmed.
    return (
        <div className="flex flex-col items-center space-y-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Clock
                    className="h-8 w-8 text-muted-foreground"
                    aria-hidden="true"
                />
            </span>
            <Header2 theme={theme}>Payment not received yet</Header2>
            <Text1 theme={theme} className="text-muted-foreground">
                We haven&apos;t seen your payment come through yet. If you just
                paid, give it a moment and check again.
            </Text1>
            <Button
                theme={theme}
                onClick={onRetryVerification}
                disabled={loading}
            >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Check status again
            </Button>
        </div>
    );
}
