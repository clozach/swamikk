import type { AdminOverview } from "@/services/admin-overview/types";
import MemberMimicLink from "@/components/member-mimic/link";
import { attentionLabels, overviewCopy as copy } from "./copy";
import { OperationalLink, Timestamp } from "./shared";

export default function AttentionList({ view }: { view: AdminOverview }) {
    const incomplete =
        view.sources.some(
            (source) => source.state === "unavailable" || source.limited,
        ) ||
        view.paidAccessChecks.limited ||
        view.paidAccessChecks.unavailable;
    return (
        <section className="space-y-4" aria-labelledby="attention-heading">
            <h2 id="attention-heading" className="text-2xl font-semibold">
                Needs attention
            </h2>
            {incomplete && (
                <p className="rounded border border-amber-500 p-3">
                    Some checks are unavailable or limited. Review coverage
                    below before drawing a conclusion.
                </p>
            )}
            <p className="text-sm text-muted-foreground">
                {view.paidAccessChecks.checked} current paid membership /
                product combinations checked for active access.{" "}
                {view.paidAccessChecks.limited
                    ? "The 25-check limit was reached. "
                    : ""}
                {view.paidAccessChecks.unavailable
                    ? "Access checking is incomplete. "
                    : ""}
                These are read-only checks, not access repairs.
            </p>
            {view.attention.length === 0 ? (
                <p className="rounded border p-5">{copy.noIssues}</p>
            ) : (
                <ul className="divide-y rounded border">
                    {view.attention.map((item) => (
                        <li
                            key={item.diagnosticId}
                            className="space-y-2 p-4"
                            id={`diagnostic-${item.diagnosticId}`}
                        >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <h3 className="font-semibold">
                                    {attentionLabels[item.kind][0]}
                                </h3>
                                {item.mode && (
                                    <span className="rounded border px-2 py-1 text-sm">
                                        {item.mode === "test"
                                            ? "Test mode"
                                            : item.mode === "live"
                                              ? "Live mode"
                                              : "Payment mode unknown"}
                                    </span>
                                )}
                            </div>
                            <p>{attentionLabels[item.kind][1]}</p>
                            <p className="text-sm">
                                Recorded state: {item.state} ·{" "}
                                <Timestamp at={item.recordedAt} />
                            </p>
                            <div className="flex flex-wrap gap-4 text-sm">
                                {item.member && (
                                    <MemberMimicLink
                                        userId={item.member.userId}
                                    >
                                        {item.member.label}
                                    </MemberMimicLink>
                                )}
                                <OperationalLink href={item.href}>
                                    {item.href === "/dashboard/support"
                                        ? "Open support"
                                        : "Open related records"}
                                </OperationalLink>
                            </div>
                            <p className="break-all text-xs text-muted-foreground">
                                Diagnostic ID: {item.diagnosticId}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
            {view.attentionLimited && (
                <p>
                    Showing {view.attention.length} of {view.attentionTotal}{" "}
                    items found in the loaded records. Open the relevant
                    workflow for the remaining items.
                </p>
            )}
        </section>
    );
}
