"use client";
import { useContext } from "react";
import { ProfileContext } from "@/components/contexts";
import { checkPermission } from "@courselit/utils";
import { UIConstants } from "@courselit/common-models";
import { useMemberMimic } from "@/components/member-mimic/context";
import { Button } from "@/components/ui/button";
import type {
    OperatorRefundRequestsView,
    RefundRequestCommand,
    RefundRequestView,
} from "@/services/refund-requests/types";
import { useRefunds } from "./use-refunds";
import { RequestCard } from "./request-card";
import { OperatorActions } from "./operator-actions";
import { refundCopy as copy } from "./copy";

export default function OperatorRefunds() {
    const mimic = useMemberMimic();
    const { profile } = useContext(ProfileContext);
    const allowed =
        mimic.kind === "inactive" &&
        !!profile &&
        checkPermission(profile.permissions || [], [
            UIConstants.permissions.manageSettings,
        ]);
    if (!allowed)
        return (
            <main className="p-7">
                <h1 className="text-2xl font-semibold">{copy.reviewTitle}</h1>
                <p className="mt-4">
                    Exit Member Mimic and sign in with payment settings
                    permission to review refunds.
                </p>
            </main>
        );
    return <OperatorForIdentity key={profile?.userId} />;
}
function OperatorForIdentity() {
    const api = useRefunds<OperatorRefundRequestsView>(
        "/api/refund-requests/review",
        false,
    );
    async function command(input: RefundRequestCommand) {
        const result = await api.command<
            RefundRequestView | { invoiceId: string }
        >(input);
        if (!result) return false;
        if ("requestId" in result)
            api.setView((current) =>
                current
                    ? {
                          requests: current.requests.map((request) =>
                              request.requestId === result.requestId
                                  ? {
                                        ...result,
                                        refundSummary: request.refundSummary,
                                    }
                                  : request,
                          ),
                      }
                    : current,
            );
        api.refresh();
        return true;
    }
    return (
        <main
            className="mx-auto max-w-4xl space-y-7 px-4 py-8 sm:px-7"
            data-feedback-id="operator-refund-review"
        >
            <header className="space-y-3">
                <h1 className="text-3xl font-semibold">{copy.reviewTitle}</h1>
                <p>{copy.reviewIntro}</p>
                <p className="rounded-xl border p-4 text-sm">{copy.queue}</p>
            </header>
            {api.message && <p role="alert">{api.message}</p>}
            <Button
                variant="outline"
                disabled={api.busy || api.loading}
                onClick={api.refresh}
            >
                {copy.refresh}
            </Button>
            {api.loading && <p role="status">Loading submitted requests…</p>}
            {api.view && !api.view.requests.length && <p>{copy.emptyQueue}</p>}
            {api.view?.requests.map((request) => (
                <RequestCard
                    key={request.requestId}
                    request={request}
                    showReceipt={false}
                >
                    <OperatorActions
                        request={request}
                        busy={api.busy || api.loading}
                        command={command}
                    />
                </RequestCard>
            ))}
        </main>
    );
}
