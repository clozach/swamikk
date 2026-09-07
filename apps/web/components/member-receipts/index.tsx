"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useMemberMimic } from "@/components/member-mimic/context";
import type { MemberReceipt } from "@/services/member-receipts/types";
import { money, date } from "@/components/member-billing/format";
import { receiptCopy as copy } from "./copy";

type State =
    | { kind: "loading" }
    | { kind: "failed" }
    | { kind: "ready"; receipt: MemberReceipt };
export default function MemberReceiptPage({
    invoiceId,
}: {
    invoiceId: string;
}) {
    const mimic = useMemberMimic();
    const identity =
        mimic.kind === "active" ? mimic.subject.userId : mimic.kind;
    return (
        <ReceiptForIdentity
            key={`${identity}:${invoiceId}`}
            invoiceId={invoiceId}
        />
    );
}
function ReceiptForIdentity({ invoiceId }: { invoiceId: string }) {
    const [state, setState] = useState<State>({ kind: "loading" });
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/member-receipts/${encodeURIComponent(invoiceId)}`, {
            cache: "no-store",
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) throw new Error();
                return response.json() as Promise<MemberReceipt>;
            })
            .then((receipt) => {
                if (!controller.signal.aborted)
                    setState({ kind: "ready", receipt });
            })
            .catch(() => {
                if (!controller.signal.aborted) setState({ kind: "failed" });
            });
        return () => controller.abort();
    }, [invoiceId, revision]);
    return (
        <main
            className="mx-auto w-full max-w-2xl space-y-7 px-4 py-8 sm:px-7"
            data-feedback-id="member-receipt"
        >
            <Link
                href="/dashboard/membership"
                className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 print:hidden"
            >
                {copy.back}
            </Link>
            <h1 className="text-3xl font-semibold">{copy.title}</h1>
            {state.kind === "loading" && <p role="status">{copy.loading}</p>}
            {state.kind === "failed" && (
                <div role="alert" className="space-y-5">
                    <p>{copy.unavailable}</p>
                    <Button
                        onClick={() => {
                            setState({ kind: "loading" });
                            setRevision((n) => n + 1);
                        }}
                    >
                        {copy.retry}
                    </Button>
                </div>
            )}
            {state.kind === "ready" && (
                <ReceiptDetails receipt={state.receipt} />
            )}
        </main>
    );
}
function ReceiptDetails({ receipt }: { receipt: MemberReceipt }) {
    return (
        <article className="space-y-7 rounded-2xl border p-6 sm:p-9">
            <header className="space-y-3">
                <p className="text-xl font-semibold">{receipt.siteName}</p>
                {receipt.mode === "test" && (
                    <p className="rounded-lg border p-3 font-medium">
                        {copy.test}
                    </p>
                )}
                {receipt.mode === "unknown" && (
                    <p className="text-sm text-muted-foreground">
                        {copy.unknownMode}
                    </p>
                )}
                {receipt.readOnly && (
                    <p className="rounded-lg border p-3 text-sm">
                        {copy.readOnly}
                    </p>
                )}
            </header>
            <dl className="space-y-6 [&_dt]:text-sm [&_dt]:text-muted-foreground [&_dd]:mt-1">
                <div>
                    <dt>{copy.reference}</dt>
                    <dd className="break-all text-sm">{receipt.invoiceId}</dd>
                </div>
                <div>
                    <dt>{copy.product}</dt>
                    <dd>{receipt.productName}</dd>
                </div>
                <div>
                    <dt>{copy.amount}</dt>
                    <dd className="text-3xl font-semibold">
                        {money(receipt.amount, receipt.currency)}
                    </dd>
                </div>
                {receipt.settlement.kind === "recorded" && (
                    <div>
                        <dt>
                            {receipt.settlement.source === "stripe-invoice-paid"
                                ? copy.paidDate
                                : copy.confirmedDate}
                        </dt>
                        <dd>
                            <time dateTime={receipt.settlement.at}>
                                {date(receipt.settlement.at)}
                            </time>
                        </dd>
                    </div>
                )}
            </dl>
            {receipt.settlement.kind === "unrecorded" && (
                <p className="text-sm text-muted-foreground">
                    {copy.dateUnknown}
                </p>
            )}
            <p className="text-sm leading-relaxed text-muted-foreground">
                {copy.proof}
            </p>
            <div className="flex flex-wrap items-center gap-5 pt-3 print:hidden">
                <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => window.print()}
                >
                    {copy.print}
                </Button>
                <Link
                    href="/p/contact"
                    className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
                >
                    {copy.help}
                </Link>
            </div>
        </article>
    );
}
