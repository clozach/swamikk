"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useMemberMimic } from "@/components/member-mimic/context";
import type {
    MemberRefundRequestsView,
    RefundRequestCommand,
    RefundRequestView,
} from "@/services/refund-requests/types";
import { useRefunds } from "./use-refunds";
import { ProductRequest } from "./product-request";
import { refundCopy as copy } from "./copy";

export default function MemberRefunds() {
    const mimic = useMemberMimic();
    return (
        <RefundsForIdentity
            key={
                mimic.kind === "active"
                    ? `mimic:${mimic.subject.userId}`
                    : mimic.kind
            }
            mimicReadOnly={mimic.kind !== "inactive"}
        />
    );
}
function RefundsForIdentity({ mimicReadOnly }: { mimicReadOnly: boolean }) {
    const api = useRefunds<MemberRefundRequestsView>(
        "/api/refund-requests",
        mimicReadOnly,
    );
    const readOnly = mimicReadOnly || !!api.view?.readOnly;
    async function command(input: RefundRequestCommand) {
        if (readOnly) return;
        const result = await api.command<RefundRequestView>(input);
        if (result)
            api.setView((current) =>
                current
                    ? {
                          ...current,
                          products: current.products.map((product) =>
                              product.invoiceId === result.invoiceId
                                  ? { ...product, request: result }
                                  : product,
                          ),
                      }
                    : current,
            );
    }
    return (
        <main
            className="mx-auto max-w-4xl space-y-7 px-4 py-8 sm:px-7"
            data-feedback-id="member-refund-requests"
        >
            <header className="space-y-3">
                <h1 className="text-3xl font-semibold">{copy.title}</h1>
                <p>{copy.intro}</p>
                <p className="text-sm text-muted-foreground">{copy.classes}</p>
                <Link
                    href="/dashboard/membership"
                    className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
                >
                    {copy.monthly}
                </Link>
            </header>
            {readOnly && (
                <p className="rounded-xl border p-4 text-sm">{copy.readOnly}</p>
            )}
            {api.message && <p role="alert">{api.message}</p>}
            <Button
                variant="outline"
                disabled={api.busy || api.loading}
                onClick={api.refresh}
            >
                {copy.refresh}
            </Button>
            {api.loading && <p role="status">{copy.loading}</p>}
            {api.view && !api.view.products.length && <p>{copy.empty}</p>}
            {api.view?.products.map((product) => (
                <ProductRequest
                    key={product.invoiceId}
                    product={product}
                    readOnly={readOnly}
                    busy={api.busy}
                    command={command}
                />
            ))}
        </main>
    );
}
