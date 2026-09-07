"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useMemberMimic } from "@/components/member-mimic/context";
import { billingCopy as copy } from "./copy";
import { MembershipCard } from "./membership-card";
import { CancellationReview } from "./review";
import { ClosingGift } from "./closing-gift";
import { useBilling } from "./use-billing";

export default function MemberBilling() {
    const mimic = useMemberMimic();
    const identity =
        mimic.kind === "active" ? `mimic:${mimic.subject.userId}` : mimic.kind;
    // Remount at the identity boundary before rendering another member's details.
    return (
        <BillingForIdentity
            key={identity}
            mimicReadOnly={mimic.kind !== "inactive"}
        />
    );
}

function BillingForIdentity({ mimicReadOnly }: { mimicReadOnly: boolean }) {
    const {
        state,
        review,
        setReview,
        busy,
        message,
        readOnly,
        refresh,
        command,
    } = useBilling(mimicReadOnly);
    const memberships = state.kind === "ready" ? state.view.memberships : [];
    const ended = memberships.some(
        (m) => m.cancellation?.closingGift && m.cancellation.access === "ended",
    );
    return (
        <main
            className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 sm:px-7"
            data-feedback-id="membership-management"
        >
            <header className="space-y-3">
                <Link
                    href="/dashboard/profile"
                    className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
                >
                    {copy.profile}
                </Link>
                <h1 className="text-3xl font-semibold sm:text-4xl">
                    {copy.title}
                </h1>
                <p className="text-muted-foreground">{copy.intro}</p>
                <nav className="flex flex-wrap gap-5 text-sm">
                    <Link
                        href="/dashboard/my-content"
                        className="inline-flex min-h-11 items-center underline underline-offset-4"
                    >
                        {copy.library}
                    </Link>
                    <a
                        href="#your-payments"
                        className="inline-flex min-h-11 items-center underline underline-offset-4"
                    >
                        {copy.refundLink}
                    </a>
                </nav>
            </header>
            {readOnly && (
                <p className="rounded-xl border p-4 text-sm">{copy.readOnly}</p>
            )}
            {message && (
                <div role="alert" className="space-y-3 rounded-xl border p-4">
                    <p>{message}</p>
                    <Button
                        variant="outline"
                        disabled={!!busy}
                        onClick={() => refresh()}
                    >
                        {copy.refresh}
                    </Button>
                </div>
            )}
            {state.kind === "loading" && <p role="status">{copy.loading}</p>}
            {state.kind === "failed" && (
                <div role="alert" className="space-y-4">
                    <p>{copy.loadFailed}</p>
                    <Button onClick={() => refresh()}>{copy.retry}</Button>
                </div>
            )}
            {state.kind === "ready" && !memberships.length && (
                <section className="space-y-4 rounded-2xl border p-7">
                    <p>{copy.empty}</p>
                    <Link
                        href="/products"
                        className="inline-flex min-h-11 items-center underline"
                    >
                        {copy.browse}
                    </Link>
                </section>
            )}
            <div id="your-payments" className="space-y-6">
                {memberships.map((membership) => (
                    <MembershipCard
                        key={membership.membershipId}
                        membership={membership}
                        readOnly={readOnly}
                        busy={busy !== null}
                        onPrepare={() =>
                            void command(
                                {
                                    action: "prepare",
                                    membershipId: membership.membershipId,
                                },
                                membership.membershipId,
                                membership.productName,
                            )
                        }
                        onReview={() => {
                            if (membership.cancellation)
                                setReview({
                                    membershipId: membership.membershipId,
                                    productName: membership.productName,
                                    operation: membership.cancellation,
                                });
                        }}
                        onReconcile={() => {
                            if (membership.cancellation)
                                void command(
                                    {
                                        action: "reconcile",
                                        operationId:
                                            membership.cancellation.operationId,
                                        quoteHash:
                                            membership.cancellation.quote.hash,
                                    },
                                    membership.membershipId,
                                    membership.productName,
                                );
                        }}
                    />
                ))}
            </div>
            {ended && <ClosingGift readOnly={readOnly} />}
            {review && (
                <CancellationReview
                    operation={review.operation}
                    productName={review.productName}
                    busy={busy !== null}
                    readOnly={readOnly}
                    onClose={() => setReview(null)}
                    onConfirm={() =>
                        void command(
                            {
                                action: "confirm",
                                operationId: review.operation.operationId,
                                quoteHash: review.operation.quote.hash,
                            },
                            review.membershipId,
                            review.productName,
                        )
                    }
                    onReconcile={() =>
                        void command(
                            {
                                action: "reconcile",
                                operationId: review.operation.operationId,
                                quoteHash: review.operation.quote.hash,
                            },
                            review.membershipId,
                            review.productName,
                        )
                    }
                />
            )}
        </main>
    );
}
