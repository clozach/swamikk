import type { AdminOverview } from "@/services/admin-overview/types";
import { overviewCopy as copy } from "./copy";
import { money, OperationalLink, Timestamp } from "./shared";

export default function OverviewSummary({ view }: { view: AdminOverview }) {
    const paymentsAvailable =
        view.sources.find((item) => item.source === "payments")?.state ===
        "available";
    const refundsAvailable = [
        "refunds",
        "cancellations",
        "refund-requests",
    ].every((name) =>
        view.sources.some(
            (item) =>
                item.source === name &&
                item.state === "available" &&
                !item.limited,
        ),
    );
    return (
        <>
            <section
                className="grid gap-4 md:grid-cols-3"
                aria-label="Membership service at a glance"
            >
                <article className="space-y-3 rounded border p-4">
                    <h2 className="font-semibold">Membership records</h2>
                    {view.membershipRecords ? (
                        <ul className="space-y-1">
                            <li>
                                Marked active:{" "}
                                <strong>{view.membershipRecords.active}</strong>
                            </li>
                            <li>
                                Pending:{" "}
                                <strong>
                                    {view.membershipRecords.pending}
                                </strong>
                            </li>
                            <li>
                                Other states:{" "}
                                <strong>{view.membershipRecords.other}</strong>
                            </li>
                        </ul>
                    ) : (
                        <p>{copy.missing}</p>
                    )}
                    <OperationalLink href="/dashboard/users">
                        Open members
                    </OperationalLink>
                </article>
                <article className="space-y-3 rounded border p-4">
                    <h2 className="font-semibold">Access records</h2>
                    {view.accessRecords ? (
                        <ul className="space-y-1">
                            <li>
                                Active periods:{" "}
                                <strong>{view.accessRecords.active}</strong>
                            </li>
                            <li>
                                Processing:{" "}
                                <strong>{view.accessRecords.processing}</strong>
                            </li>
                            <li>
                                Ended periods:{" "}
                                <strong>{view.accessRecords.ended}</strong>
                            </li>
                        </ul>
                    ) : (
                        <p>{copy.missing}</p>
                    )}
                    <OperationalLink href="/dashboard/support">
                        Inspect diagnostics
                    </OperationalLink>
                </article>
                <article className="space-y-3 rounded border p-4">
                    <h2 className="font-semibold">Published products</h2>
                    <p className="text-3xl font-semibold">
                        {view.publishedProducts ?? copy.missing}
                    </p>
                    <p className="text-sm">Courses and downloads</p>
                    <OperationalLink href="/dashboard/products">
                        Open products
                    </OperationalLink>
                </article>
            </section>
            <p className="text-sm text-muted-foreground">{copy.membership}</p>
            <section className="space-y-4" aria-labelledby="payments-heading">
                <h2 id="payments-heading" className="text-2xl font-semibold">
                    Payments and recorded refunds
                </h2>
                <p className="text-sm text-muted-foreground">{copy.money}</p>
                {!paymentsAvailable ? (
                    <p>{copy.missing}: paid receipts could not be read.</p>
                ) : view.payments.length === 0 ? (
                    <p>
                        No dated paid receipts in the loaded records for this
                        period.
                    </p>
                ) : (
                    <ul className="grid gap-4 md:grid-cols-2">
                        {view.payments.map((group) => (
                            <li
                                key={`${group.mode}:${group.currency}`}
                                className="space-y-2 rounded border p-4"
                            >
                                <h3 className="font-semibold">
                                    {group.mode === "test"
                                        ? "Test payments"
                                        : group.mode === "live"
                                          ? "Live payments"
                                          : "Payment mode unknown"}{" "}
                                    · {group.currency}
                                </h3>
                                <p>
                                    Original paid amount:{" "}
                                    <strong>
                                        {money(group.paid, group.currency)}
                                    </strong>{" "}
                                    · {group.receipts} receipts
                                </p>
                                <p>
                                    Recorded successful refunds:{" "}
                                    <strong>
                                        {refundsAvailable
                                            ? group.refundEvidenceCount === 0
                                                ? "Not recorded"
                                                : money(
                                                      group.observedRefunds,
                                                      group.currency,
                                                  )
                                            : copy.missing}
                                    </strong>
                                </p>
                                <p className="text-sm">
                                    {group.refundEvidenceCount} of{" "}
                                    {group.receipts} receipts have a refund
                                    observation. Missing observations are not
                                    zero refunds.
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Oldest refund check:{" "}
                                    <Timestamp at={group.refundsCheckedAt} />
                                </p>
                            </li>
                        ))}
                    </ul>
                )}
                {!!view.undatedPaidReceipts && (
                    <p>
                        {view.undatedPaidReceipts} recently created paid
                        receipts have no verified settlement date and are
                        excluded from period totals.
                    </p>
                )}
                <OperationalLink href="/dashboard/transactions">
                    Open transactions
                </OperationalLink>
            </section>
        </>
    );
}
